import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as pdfjsLib from 'pdfjs-dist'
import { apiBase } from '../api/client'
import { getDocument } from '../api/documents'
import { NotesPanel } from '../components/NotesPanel'
import { DeadZonePanel } from '../components/DeadZonePanel'
import { loadDeadZone, isInDeadZone, type DeadZoneConfig } from '../store/deadZone'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

type Pt = { x: number; y: number }
type Stroke = { pts: Pt[]; color: string; width: number; eraser: boolean; page: number }

const COLORS = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#a855f7']
const WIDTHS = [2, 4, 7, 13]

export function PdfMarkupPage() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>()

  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState('#000000')
  const [lineWidth, setLineWidth] = useState(4)
  const [strokeCount, setStrokeCount] = useState(0)
  const [saveSignal, setSaveSignal] = useState(0)
  const [showMarkup, setShowMarkup] = useState(true)
  const [showNotes, setShowNotes] = useState(false)
  const [scale, setScale] = useState(1)
  const [showDeadZone, setShowDeadZone] = useState(false)
  const [deadZoneCfg, setDeadZoneCfg] = useState<DeadZoneConfig>(() => loadDeadZone())
  const deadZoneRef = useRef<DeadZoneConfig>(deadZoneCfg)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)

  const { data: doc } = useQuery({ queryKey: ['document', id], queryFn: () => getDocument(id!) })
  const notes = doc?.notes ?? []

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const innerDivRef = useRef<HTMLDivElement>(null)
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pdfCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const drawCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const nativeListeners = useRef<Map<number, () => void>>(new Map())
  const strokes = useRef<Stroke[]>([])
  const drawing = useRef(false)
  const activePage = useRef(-1)
  const curPts = useRef<Pt[]>([])
  // Cached canvas bounding rect — set once in onDown, reused throughout the stroke to avoid
  // repeated getBoundingClientRect() calls (each one forces a layout flush on iOS).
  const canvasRectRef = useRef<DOMRect | null>(null)
  const touchScrollStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const activeTouchCount = useRef(0)
  // Track pointer/touch IDs that started in the dead zone so they stay ignored even if they move out
  const deadZonePointerIds = useRef(new Set<number>())
  const deadZoneTouchIds   = useRef(new Set<number>())
  const toolbarRef  = useRef<HTMLDivElement>(null)
  const [toolbarH, setToolbarH] = useState(0)
  const toolbarHRef = useRef(0)

  // Refs so native event handlers always read the latest values without stale closures
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  const lineWidthRef = useRef(lineWidth)
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { lineWidthRef.current = lineWidth }, [lineWidth])

  // ── Stroke persistence ────────────────────────────────────────────────────
  useEffect(() => {
    setSaveSignal(0)
    const saved = localStorage.getItem(`markup_${fileId}`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        strokes.current = parsed
        setStrokeCount(parsed.length)
      }
    } catch {}
  }, [fileId])

  // Only save when saveSignal > 0 (i.e., after a user action, not on initial load)
  useEffect(() => {
    if (saveSignal === 0) return
    if (fileId) localStorage.setItem(`markup_${fileId}`, JSON.stringify(strokes.current))
  }, [saveSignal, fileId])

  // Measure toolbar height for dead zone offset.
  // useLayoutEffect fires before paint so toolbarHRef is set before the first pointer event.
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      toolbarHRef.current = el.offsetHeight
      setToolbarH(el.offsetHeight)
    })
    ro.observe(el)
    toolbarHRef.current = el.offsetHeight
    setToolbarH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    pdfjsLib.getDocument({ url: `${apiBase}/documents/${id}/files/${fileId}/view` }).promise
      .then((doc) => { docRef.current = doc; setNumPages(doc.numPages); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id, fileId])

  // ── Redraw saved strokes ──────────────────────────────────────────────────
  const redrawPage = useCallback((pageIndex: number) => {
    const dc = drawCanvases.current.get(pageIndex)
    if (!dc) return
    const ctx = dc.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, dc.width, dc.height)
    for (const s of strokes.current) {
      if (s.page !== pageIndex || s.pts.length < 2) continue
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      if (s.eraser) {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = s.width * 4 * dpr
      } else {
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width * dpr
      }
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x * dpr, s.pts[0].y * dpr)
      for (const p of s.pts.slice(1)) ctx.lineTo(p.x * dpr, p.y * dpr)
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  // ── Render PDF page ───────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = docRef.current
    const pc = pdfCanvases.current.get(pageNum)
    if (!doc || !pc) return

    const page = await doc.getPage(pageNum)
    const dpr = window.devicePixelRatio || 1
    const maxW = Math.min(window.innerWidth - 32, 960)
    const baseScale = maxW / page.getViewport({ scale: 1 }).width
    const vp   = page.getViewport({ scale: baseScale })
    const hiVp = page.getViewport({ scale: baseScale * dpr })

    pc.width = hiVp.width
    pc.height = hiVp.height
    pc.style.width  = vp.width  + 'px'
    pc.style.height = vp.height + 'px'
    await page.render({ canvasContext: pc.getContext('2d')!, viewport: hiVp, canvas: pc }).promise

    const dc = drawCanvases.current.get(pageNum)
    if (dc) {
      const w = Math.floor(hiVp.width), h = Math.floor(hiVp.height)
      if (dc.width !== w || dc.height !== h) {
        dc.width = w; dc.height = h
        dc.style.width  = Math.floor(vp.width)  + 'px'
        dc.style.height = Math.floor(vp.height) + 'px'
        redrawPage(pageNum)
      }
    }
  }, [redrawPage])

  const setPdfCanvas = useCallback((pageNum: number, el: HTMLCanvasElement | null) => {
    if (el) { pdfCanvases.current.set(pageNum, el); renderPage(pageNum) }
  }, [renderPage])

  // ── Attach native pointer listeners to drawing canvas ─────────────────────
  // Native listeners fire at full device rate (120 Hz+), bypassing React's
  // synthetic event system which can drop events during fast Pencil strokes.
  const setDrawCanvas = useCallback((pageNum: number, el: HTMLCanvasElement | null) => {
    nativeListeners.current.get(pageNum)?.()
    nativeListeners.current.delete(pageNum)

    if (!el) { drawCanvases.current.delete(pageNum); return }
    drawCanvases.current.set(pageNum, el)

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const isStylus = (e as any).touchType === 'stylus'
        if (!isStylus) {
          // Finger touch: check dead zone and handle scroll tracking
          if (isInDeadZone(e.clientX, e.clientY, deadZoneRef.current, toolbarHRef.current)) {
            deadZonePointerIds.current.add(e.pointerId)
            try { el.setPointerCapture(e.pointerId) } catch (_) {}
            return
          }
          activeTouchCount.current++
          if (activeTouchCount.current === 1 && !drawing.current && scrollContainerRef.current)
            touchScrollStart.current = {
              x: e.clientX, y: e.clientY,
              scrollLeft: scrollContainerRef.current.scrollLeft,
              scrollTop: scrollContainerRef.current.scrollTop,
            }
          else
            touchScrollStart.current = null
          return
        }
        // Apple Pencil on older iOS (touchType='stylus'): fall through to drawing logic below
      }
      // Pen (pointerType='pen', modern iPadOS Apple Pencil), older iOS stylus, or Mouse.
      // Dead zone only applies to mouse — Apple Pencil always draws regardless of position.
      if (e.pointerType === 'mouse' && isInDeadZone(e.clientX, e.clientY, deadZoneRef.current, toolbarHRef.current)) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      // Lock scroll container to prevent palm touch from scrolling during pen stroke
      if (scrollContainerRef.current) scrollContainerRef.current.style.overflowY = 'hidden'
      drawing.current = true
      activePage.current = pageNum
      // Cache rect once per stroke here (after overflow change) so onMove never needs to
      // call getBoundingClientRect(), which forces a layout flush on every pointer event.
      canvasRectRef.current = el.getBoundingClientRect()
      {
        const r = canvasRectRef.current
        const dpr = window.devicePixelRatio || 1
        curPts.current = [{
          x: (e.clientX - r.left) / r.width  * el.width  / dpr,
          y: (e.clientY - r.top)  / r.height * el.height / dpr,
        }]
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const isStylus = (e as any).touchType === 'stylus'
        if (!isStylus) {
          if (deadZonePointerIds.current.has(e.pointerId)) return
          if (activeTouchCount.current === 1 && !drawing.current && touchScrollStart.current && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop  = touchScrollStart.current.scrollTop  + (touchScrollStart.current.y - e.clientY)
            scrollContainerRef.current.scrollLeft = touchScrollStart.current.scrollLeft + (touchScrollStart.current.x - e.clientX)
          }
          return
        }
        // Apple Pencil on older iOS: fall through to drawing logic
      }
      if (!drawing.current || activePage.current !== pageNum) return
      e.preventDefault()

      // getCoalescedEvents captures all intermediate positions the browser merged
      // into this event — essential for fast Pencil strokes to avoid gaps.
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
      const dc = drawCanvases.current.get(pageNum)
      const r2 = canvasRectRef.current  // cached in onDown — no layout flush here
      if (!dc || !r2) return

      const dpr = window.devicePixelRatio || 1
      const ctx = dc.getContext('2d')!

      // Set state once for the whole coalesced batch, then draw one continuous path.
      // Per-segment save/restore/beginPath/stroke multiplies GPU flush cost at 120 Hz.
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (toolRef.current === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = lineWidthRef.current * 4 * dpr
      } else {
        ctx.strokeStyle = colorRef.current
        ctx.lineWidth = lineWidthRef.current * dpr
      }
      ctx.beginPath()
      let drewAny = false
      for (const ev of evs) {
        const pt = {
          x: (ev.clientX - r2.left) / r2.width  * el.width  / dpr,
          y: (ev.clientY - r2.top)  / r2.height * el.height / dpr,
        }
        const prev = curPts.current[curPts.current.length - 1]
        curPts.current.push(pt)
        if (!prev) continue
        if (!drewAny) { ctx.moveTo(prev.x * dpr, prev.y * dpr); drewAny = true }
        ctx.lineTo(pt.x * dpr, pt.y * dpr)
      }
      if (drewAny) ctx.stroke()
      ctx.restore()
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const isStylus = (e as any).touchType === 'stylus'
        if (!isStylus) {
          if (deadZonePointerIds.current.has(e.pointerId)) {
            deadZonePointerIds.current.delete(e.pointerId)
            return
          }
          activeTouchCount.current = Math.max(0, activeTouchCount.current - 1)
          touchScrollStart.current = null
          return
        }
        // Apple Pencil on older iOS: fall through to stroke-end logic
      }
      if (!drawing.current) return
      drawing.current = false
      if (scrollContainerRef.current) scrollContainerRef.current.style.overflowY = 'auto'
      if (curPts.current.length >= 2) {
        strokes.current = [...strokes.current, {
          pts: [...curPts.current],
          color: colorRef.current,
          width: lineWidthRef.current,
          eraser: toolRef.current === 'eraser',
          page: activePage.current,
        }]
        setStrokeCount(c => c + 1)
        setSaveSignal(s => s + 1)
      }
      curPts.current = []
      activePage.current = -1
    }

    const onSelectStart = (e: Event) => e.preventDefault()
    const onContextMenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove, { passive: false })
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('selectstart', onSelectStart)
    el.addEventListener('contextmenu', onContextMenu)

    nativeListeners.current.set(pageNum, () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('selectstart', onSelectStart)
      el.removeEventListener('contextmenu', onContextMenu)
    })
  }, []) // [] — mutable state via refs; setStrokeCount and setSaveSignal are stable setters

  // Defensive cleanup: remove all canvas listeners if React's per-element null-ref calls are skipped
  useEffect(() => {
    return () => nativeListeners.current.forEach(fn => fn())
  }, [])

  // ── Scale helpers ─────────────────────────────────────────────────────────
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  // CSS zoom (unlike transform) affects layout, so the scroll container
  // naturally expands and enables horizontal pan when zoomed in.
  const applyVisualScale = useCallback((next: number) => {
    if (!innerDivRef.current) return
    innerDivRef.current.style.zoom = String(next)
  }, [])

  useLayoutEffect(() => { applyVisualScale(scale) }, [scale, numPages, applyVisualScale])

  // ── Ctrl+wheel zoom ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const next = Math.min(4, Math.max(0.25, scaleRef.current * factor))

      // Anchor zoom to cursor position
      const rect = el.getBoundingClientRect()
      const viewX = e.clientX - rect.left
      const viewY = e.clientY - rect.top
      const oldScale = scaleRef.current
      const targetLeft = ((viewX + el.scrollLeft) / oldScale) * next - viewX
      const targetTop  = ((viewY + el.scrollTop)  / oldScale) * next - viewY

      scaleRef.current = next
      applyVisualScale(next)
      el.scrollLeft = targetLeft
      el.scrollTop  = targetTop

      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(() => setScale(scaleRef.current), 300)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    }
  }, [applyVisualScale])

  // ── Pinch-to-zoom (native listeners — React's synthetic onTouchMove is passive) ──
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      // Scan ALL touches (not just changedTouches) so we catch dead-zone fingers that landed
      // on the overlay div — those don't bubble to this element but still appear in e.touches.
      // First purge IDs that are no longer on screen (overlay touches that lifted without us seeing touchend).
      const currentIds = new Set(Array.from(e.touches).map(t => t.identifier))
      for (const id of [...deadZoneTouchIds.current]) {
        if (!currentIds.has(id)) deadZoneTouchIds.current.delete(id)
      }
      for (const t of Array.from(e.touches)) {
        if ((t as any).touchType === 'stylus') continue  // Apple Pencil on older iOS never enters dead zone
        if (isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current))
          deadZoneTouchIds.current.add(t.identifier)
      }

      // If any NEW finger touch (not stylus) landed in the dead zone, preventDefault() to stop
      // iOS from starting a native scroll/gesture session that would block Apple Pencil events.
      if (Array.from(e.changedTouches).some(t =>
        (t as any).touchType !== 'stylus' &&
        isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current)
      )) {
        e.preventDefault()
      }

      const active = Array.from(e.touches).filter(t => !deadZoneTouchIds.current.has(t.identifier))
      if (active.length !== 2) return
      const [a, b] = active
      pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: scaleRef.current }
    }

    const onTouchMove = (e: TouchEvent) => {
      const active = Array.from(e.touches).filter(t => !deadZoneTouchIds.current.has(t.identifier))
      // When any dead-zone finger is on screen, prevent native scroll/gesture immediately.
      // This is belt-and-suspenders alongside the touchstart preventDefault: iOS may start
      // a new native gesture on the first touchmove if it didn't intercept at touchstart.
      if (active.length < e.touches.length) e.preventDefault()
      if (active.length !== 2 || !pinchRef.current) return
      e.preventDefault()
      const [a, b] = active
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = Math.min(4, Math.max(0.25, pinchRef.current.scale * (dist / pinchRef.current.dist)))

      // Anchor zoom to the midpoint between the two fingers so it feels natural
      const rect = el.getBoundingClientRect()
      const viewX = (a.clientX + b.clientX) / 2 - rect.left
      const viewY = (a.clientY + b.clientY) / 2 - rect.top
      const oldScale = scaleRef.current
      const targetLeft = ((viewX + el.scrollLeft) / oldScale) * next - viewX
      const targetTop  = ((viewY + el.scrollTop)  / oldScale) * next - viewY

      scaleRef.current = next
      applyVisualScale(next)
      el.scrollLeft = targetLeft
      el.scrollTop  = targetTop
    }

    const onTouchEnd = (e: TouchEvent) => {
      // Remove IDs no longer on screen (covers overlay touches that don't bubble touchend here)
      const remaining = new Set(Array.from(e.touches).map(t => t.identifier))
      for (const id of [...deadZoneTouchIds.current]) {
        if (!remaining.has(id)) deadZoneTouchIds.current.delete(id)
      }
      if (pinchRef.current !== null) setScale(scaleRef.current)
      pinchRef.current = null
    }

    // passive: false は必須 — dead zone touch で e.preventDefault() を呼ぶため
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [applyVisualScale])

  // ── Undo / Clear ──────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (!strokes.current.length) return
    const lastPage = strokes.current[strokes.current.length - 1].page
    strokes.current = strokes.current.slice(0, -1)
    redrawPage(lastPage)
    setStrokeCount(c => c - 1)
    setSaveSignal(s => s + 1)
  }, [redrawPage])

  const clearAll = useCallback(() => {
    const pages = new Set(strokes.current.map(s => s.page))
    strokes.current = []
    pages.forEach(p => redrawPage(p))
    setStrokeCount(0)
    setSaveSignal(s => s + 1)
  }, [redrawPage])

  const hasStrokes = strokeCount > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', display: 'flex', flexDirection: 'column', background: '#1e293b', userSelect: 'none', WebkitUserSelect: 'none', boxSizing: 'border-box' }}>

      {/* Toolbar */}
      <div ref={toolbarRef} style={{
        flexShrink: 0, background: '#0f172a',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
        position: 'relative', zIndex: 20,
      }}>
        <button onClick={() => window.close()}
          style={{ color: '#94a3b8', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', flexShrink: 0, padding: '4px 8px' }}>
          ✕ 閉じる
        </button>
        <Sep />
        <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')}>ペン</ToolBtn>
        <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')}>消しゴム</ToolBtn>
        <Sep />
        {COLORS.map(c => (
          <button key={c} onClick={() => { setColor(c); setTool('pen') }}
            style={{
              width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
              border: color === c && tool === 'pen' ? '3px solid #6366f1' : '2px solid #4b5563',
            }} />
        ))}
        <Sep />
        {WIDTHS.map(w => (
          <button key={w} onClick={() => setLineWidth(w)}
            style={{
              width: 30, height: 30, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              background: lineWidth === w ? '#334155' : 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <div style={{ width: Math.min(w, 16), height: Math.min(w, 16), borderRadius: '50%', background: '#e2e8f0' }} />
          </button>
        ))}
        <Sep />
        <ToolBtn active={false} disabled={!hasStrokes} onClick={undo}>元に戻す</ToolBtn>
        <ToolBtn active={false} disabled={!hasStrokes} onClick={clearAll}
          style={{ color: hasStrokes ? '#f87171' : undefined }}>全消去</ToolBtn>
        <Sep />
        <ToolBtn active={!showMarkup} onClick={() => setShowMarkup(s => !s)}>
          {showMarkup ? '描画を隠す' : '描画を表示'}
        </ToolBtn>
        <Sep />
        <ToolBtn active={showNotes} onClick={() => setShowNotes(s => !s)}>
          メモ {notes.length > 0 ? `(${notes.length})` : ''}
        </ToolBtn>
        <Sep />
        <ToolBtn active={showDeadZone} onClick={() => setShowDeadZone(s => !s)}>
          不感領域
        </ToolBtn>
        <Sep />
        <ToolBtn active={false} onClick={() => setScale(s => Math.max(0.25, s * 0.8))}>－</ToolBtn>
        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, minWidth: 36, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <ToolBtn active={false} onClick={() => setScale(s => Math.min(4, s * 1.25))}>＋</ToolBtn>
        {scale !== 1 && (
          <ToolBtn active={false} onClick={() => setScale(1)} style={{ color: '#64748b' }}>1:1</ToolBtn>
        )}
      </div>

      {/* PDF pages */}
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, overflow: 'auto', padding: '16px 16px 32px', touchAction: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', minWidth: 'fit-content' }}>
          <div ref={innerDivRef} style={{ zoom: scale }}>
            {loading && <p style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 60 }}>PDF を読み込み中...</p>}
            {!loading && numPages === 0 && <p style={{ color: '#f87171', textAlign: 'center', paddingTop: 60 }}>PDF が見つかりません</p>}
            {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
              <div key={pageNum} style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
                <canvas ref={(el) => setPdfCanvas(pageNum, el)} style={{ display: 'block', borderRadius: 4 }} />
                <canvas
                  ref={(el) => setDrawCanvas(pageNum, el)}
                  style={{
                    position: 'absolute', top: 0, left: 0, borderRadius: 4,
                    touchAction: showMarkup ? 'none' : 'pan-x pan-y',
                    cursor: showMarkup ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'grab',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    visibility: showMarkup ? 'visible' : 'hidden',
                    pointerEvents: showMarkup ? 'auto' : 'none',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: 5, background: '#0f172a', textAlign: 'center', fontSize: 11, color: '#475569' }}>
        Apple Pencil → ペン入力　　指 → スクロール／パン　　2本指ピンチ → ズーム　　Ctrl+ホイール → ズーム
      </div>

      <NotesPanel show={showNotes} docId={id!} notes={notes} />
      <DeadZonePanel
        show={showDeadZone}
        onClose={() => setShowDeadZone(false)}
        onChange={cfg => { deadZoneRef.current = cfg; setDeadZoneCfg(cfg) }}
      />
      {/* Dead zone visual overlay — pointerEvents:'auto' + touchAction:'none' makes the overlay
          consume all touch/pointer events in the dead zone so nothing underneath reacts */}
      {/* Dead zone visual overlays — pointer-events:none so the overlay never captures iOS touches.
          Capturing touches here blocks Apple Pencil events on the canvas underneath.
          Dead zone logic is handled entirely in the canvas onDown/onMove handlers. */}
      {deadZoneCfg.left   > 0 && <div style={{ position: 'fixed', left: 0,   top: toolbarH, bottom: 0, width:  deadZoneCfg.left,   background: 'rgba(212,168,67,0.08)', borderRight: '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.right  > 0 && <div style={{ position: 'fixed', right: 0,  top: toolbarH, bottom: 0, width:  deadZoneCfg.right,  background: 'rgba(212,168,67,0.08)', borderLeft:  '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.top    > 0 && <div style={{ position: 'fixed', top: toolbarH, left: 0, right: 0, height: deadZoneCfg.top,    background: 'rgba(212,168,67,0.08)', borderBottom:'1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.bottom > 0 && <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: deadZoneCfg.bottom, background: 'rgba(212,168,67,0.08)', borderTop:   '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 28, background: '#1e3a5f', flexShrink: 0 }} />
}

function ToolBtn({ active, onClick, children, disabled, style }: {
  active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '5px 10px', borderRadius: 6, border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12, fontWeight: 600, flexShrink: 0,
        background: active ? '#6366f1' : 'transparent',
        color: active ? '#fff' : disabled ? '#4b5563' : '#94a3b8',
        ...style,
      }}>
      {children}
    </button>
  )
}
