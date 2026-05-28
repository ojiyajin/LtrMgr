import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { getFileContent } from '../api/documents'
import { preprocessMath } from '../utils/mathPreprocess'

// Coordinates stored as fractions [0, 1] of canvas CSS dimensions.
// This makes strokes device/orientation-invariant: after a rotation that
// changes the canvas size, fractional coords still map to the same
// proportional position in the document.
type Pt = { x: number; y: number }
type MdStroke = { pts: Pt[]; color: string; width: number; eraser: boolean; highlighter: boolean }

// v2 key — incompatible format change (absolute px → fractions)
const STORAGE_KEY = (fileId: string) => `md_markup_v2_${fileId}`

export interface MarkdownMarkupHandle {
  undo: () => void
  clear: () => void
}

interface Props {
  docId: string
  fileId: string
  fontScale?: number
  rawMath?: boolean
  markupEnabled?: boolean
  tool?: 'pen' | 'highlighter' | 'eraser'
  color?: string
  lineWidth?: number
  showMarkup?: boolean
  onStrokeCountChange?: (n: number) => void
  markupHandleRef?: React.MutableRefObject<MarkdownMarkupHandle | null>
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onContentLoaded?: (text: string) => void
}

export function MarkdownViewer({
  docId,
  fileId,
  fontScale = 1,
  rawMath = false,
  markupEnabled = false,
  tool = 'pen',
  color = '#ef4444',
  lineWidth = 4,
  showMarkup = true,
  onStrokeCountChange,
  markupHandleRef,
  scrollRef,
  onContentLoaded,
}: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const contentDivRef = useRef<HTMLDivElement>(null)
  // Main canvas: completed strokes only. Never cleared during an active stroke.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Overlay canvas: the single in-progress highlighter stroke.
  // Drawn as one complete path on every pointermove to avoid alpha accumulation.
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<MdStroke[]>([])
  const drawing = useRef(false)
  const curPts = useRef<Pt[]>([])
  const canvasRectRef = useRef<DOMRect | null>(null)
  const touchScrollStart = useRef<{ y: number; scrollTop: number } | null>(null)

  // Mutable refs — native event handlers read these without stale closures
  const toolRef           = useRef(tool)
  const colorRef          = useRef(color)
  const lineWidthRef      = useRef(lineWidth)
  const markupEnabledRef  = useRef(markupEnabled)
  const fileIdRef         = useRef(fileId)
  const onCountRef        = useRef(onStrokeCountChange)
  const scrollRefRef      = useRef(scrollRef)
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { lineWidthRef.current = lineWidth }, [lineWidth])
  useEffect(() => { markupEnabledRef.current = markupEnabled }, [markupEnabled])
  useEffect(() => { fileIdRef.current = fileId }, [fileId])
  useEffect(() => { onCountRef.current = onStrokeCountChange }, [onStrokeCountChange])
  useEffect(() => { scrollRefRef.current = scrollRef }, [scrollRef])

  useEffect(() => {
    setContent(null)
    setError(false)
    getFileContent(docId, fileId)
      .then(text => { setContent(text); onContentLoaded?.(text) })
      .catch(() => setError(true))
  }, [docId, fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved strokes whenever the file changes
  useEffect(() => {
    strokes.current = []
    const saved = localStorage.getItem(STORAGE_KEY(fileId))
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        strokes.current = parsed
        onCountRef.current?.(parsed.length)
      }
    } catch {}
  }, [fileId])

  // Draw all completed strokes on the main canvas.
  // Coordinates are stored as fractions [0,1]; multiply by canvas physical
  // dimensions to get the correct pixel position at any canvas size.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const s of strokes.current) {
      if (s.pts.length < 2) continue
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (s.eraser) {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = s.width * 4 * dpr
      } else if (s.highlighter) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.38
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width * 8 * dpr
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width * dpr
      }
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x * canvas.width, s.pts[0].y * canvas.height)
      for (const p of s.pts.slice(1)) ctx.lineTo(p.x * canvas.width, p.y * canvas.height)
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  // redrawRef lets the useEffect([]) closure always call the latest redraw
  const redrawRef = useRef(redraw)
  useEffect(() => { redrawRef.current = redraw }, [redraw])

  const resizeCanvas = useCallback(() => {
    const canvas  = canvasRef.current
    const overlay = overlayRef.current
    const div     = contentDivRef.current
    if (!canvas || !div) return
    const dpr = window.devicePixelRatio || 1
    const rect = div.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(div.scrollHeight)
    const wPx = w * dpr
    const hPx = h * dpr
    if (canvas.width !== wPx || canvas.height !== hPx) {
      canvas.width  = wPx
      canvas.height = hPx
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
      if (overlay) {
        overlay.width  = wPx
        overlay.height = hPx
        overlay.style.width  = w + 'px'
        overlay.style.height = h + 'px'
      }
      redraw()
    }
  }, [redraw])

  useEffect(() => {
    const div = contentDivRef.current
    if (!div) return
    const ro = new ResizeObserver(resizeCanvas)
    ro.observe(div)
    resizeCanvas()
    return () => ro.disconnect()
  }, [resizeCanvas])

  useEffect(() => {
    resizeCanvas()
  }, [fontScale, resizeCanvas])

  // Attach native pointer listeners ONCE on mount.
  useEffect(() => {
    const canvas  = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas) return

    const saveStrokes = () =>
      localStorage.setItem(STORAGE_KEY(fileIdRef.current), JSON.stringify(strokes.current))

    // Draw the in-progress pen or highlighter stroke on the overlay as one complete
    // path. Always clears first so there is never stale content. Drawing as a single
    // path (not incremental segments) avoids two artifacts: (1) globalAlpha
    // accumulation at segment joints for highlighter, and (2) per-segment round-cap
    // "beads" at each onMove boundary for the pen.
    const drawCurrentStroke = () => {
      if (!overlay) return
      const dpr = window.devicePixelRatio || 1
      const oCtx = overlay.getContext('2d')!
      oCtx.clearRect(0, 0, overlay.width, overlay.height)
      if (curPts.current.length < 2) return
      const t = toolRef.current
      oCtx.save()
      oCtx.lineCap = 'round'
      oCtx.lineJoin = 'round'
      if (t === 'highlighter') {
        oCtx.globalCompositeOperation = 'source-over'
        oCtx.globalAlpha = 0.38
        oCtx.strokeStyle = colorRef.current
        oCtx.lineWidth = lineWidthRef.current * 8 * dpr
      } else {
        oCtx.globalCompositeOperation = 'source-over'
        oCtx.strokeStyle = colorRef.current
        oCtx.lineWidth = lineWidthRef.current * dpr
      }
      oCtx.beginPath()
      oCtx.moveTo(curPts.current[0].x * overlay.width, curPts.current[0].y * overlay.height)
      for (const p of curPts.current.slice(1)) oCtx.lineTo(p.x * overlay.width, p.y * overlay.height)
      oCtx.stroke()
      oCtx.restore()
    }

    const clearOverlay = () => {
      if (!overlay) return
      overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height)
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        if (e.pointerType === 'touch') {
          const sc = scrollRefRef.current?.current
          if (sc) touchScrollStart.current = { y: e.clientY, scrollTop: sc.scrollTop }
        }
        return
      }
      if (!markupEnabledRef.current) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      drawing.current = true
      // Cache the bounding rect once per stroke. getBoundingClientRect includes
      // the full canvas height even when the element extends below the viewport.
      canvasRectRef.current = canvas.getBoundingClientRect()
      const r = canvasRectRef.current
      // Store coordinates as fractions [0,1] of the canvas CSS dimensions so
      // they remain valid after orientation changes that alter the canvas size.
      curPts.current = [{
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top)  / r.height,
      }]
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        if (e.pointerType === 'touch' && touchScrollStart.current) {
          const sc = scrollRefRef.current?.current
          if (sc) sc.scrollTop = touchScrollStart.current.scrollTop + (touchScrollStart.current.y - e.clientY)
        }
        return
      }
      if (!drawing.current) return
      e.preventDefault()
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
      // Re-fetch every move: canvas position in viewport changes when the scroll
      // container scrolls or the device rotates, so a cached onDown rect drifts.
      const r = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const t = toolRef.current

      // Capture the last accumulated point before adding new ones (used by eraser).
      const prevPt = curPts.current[curPts.current.length - 1]

      for (const ev of evs) {
        curPts.current.push({
          x: (ev.clientX - r.left) / r.width,
          y: (ev.clientY - r.top)  / r.height,
        })
      }

      if (t === 'eraser') {
        // Eraser: draw incrementally on the main canvas. destination-out compositing
        // does not work on a transparent overlay because it would erase the overlay
        // pixels (which are empty) rather than the completed-stroke pixels below.
        if (!prevPt) return
        const ctx = canvas.getContext('2d')!
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = lineWidthRef.current * 4 * dpr
        ctx.beginPath()
        ctx.moveTo(prevPt.x * canvas.width, prevPt.y * canvas.height)
        for (const p of curPts.current.slice(curPts.current.length - evs.length)) {
          ctx.lineTo(p.x * canvas.width, p.y * canvas.height)
        }
        ctx.stroke()
        ctx.restore()
      } else {
        // Pen / highlighter: accumulate all points and redraw the ENTIRE current
        // stroke on the overlay as one path. This eliminates both alpha-accumulation
        // (highlighter) and per-segment round-cap artifacts (pen) that occur when
        // strokes are drawn as incremental segments across multiple onMove events.
        drawCurrentStroke()
      }
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        if (e.pointerType === 'touch') touchScrollStart.current = null
        return
      }
      if (!drawing.current) return
      drawing.current = false
      if (curPts.current.length >= 2) {
        const t = toolRef.current
        strokes.current = [...strokes.current, {
          pts: [...curPts.current],
          color: colorRef.current,
          width: lineWidthRef.current,
          eraser: t === 'eraser',
          highlighter: t === 'highlighter',
        }]
        if (t !== 'eraser') {
          // Pen / highlighter: commit overlay to the main canvas, then clear overlay.
          redrawRef.current()
          clearOverlay()
        }
        // Eraser: already drawn incrementally on the main canvas; no redraw needed.
        saveStrokes()
        onCountRef.current?.(strokes.current.length)
      } else {
        // Stroke too short to save; clear any overlay remnant.
        clearOverlay()
      }
      curPts.current = []
    }

    // pointercancel fires when the browser or OS aborts the pointer sequence
    // (e.g. palm rejection, orientation change, system gesture).
    // If the stroke accumulated enough points (≥5) it's likely intentional —
    // save it so the user doesn't lose visible work. Shorter fragments are
    // discarded as accidental touches.
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        if (e.pointerType === 'touch') touchScrollStart.current = null
        return
      }
      if (!drawing.current) return
      drawing.current = false
      const t = toolRef.current
      if (curPts.current.length >= 5 && t !== 'eraser') {
        strokes.current = [...strokes.current, {
          pts: [...curPts.current],
          color: colorRef.current,
          width: lineWidthRef.current,
          eraser: false,
          highlighter: t === 'highlighter',
        }]
        redrawRef.current()
        saveStrokes()
        onCountRef.current?.(strokes.current.length)
      }
      clearOverlay()
      if (t === 'eraser') {
        // Undo any incremental erasing applied during this cancelled stroke.
        redrawRef.current()
      }
      curPts.current = []
    }

    canvas.addEventListener('pointerdown',  onDown,    { passive: false })
    canvas.addEventListener('pointermove',  onMove,    { passive: false })
    canvas.addEventListener('pointerup',    onUp)
    canvas.addEventListener('pointercancel', onCancel)
    return () => {
      canvas.removeEventListener('pointerdown',  onDown)
      canvas.removeEventListener('pointermove',  onMove)
      canvas.removeEventListener('pointerup',    onUp)
      canvas.removeEventListener('pointercancel', onCancel)
    }
  }, []) // [] — only mutable refs used inside

  // Expose undo/clear to the parent
  useEffect(() => {
    if (!markupHandleRef) return
    markupHandleRef.current = {
      undo: () => {
        if (!strokes.current.length) return
        strokes.current = strokes.current.slice(0, -1)
        redraw()
        localStorage.setItem(STORAGE_KEY(fileIdRef.current), JSON.stringify(strokes.current))
        onCountRef.current?.(strokes.current.length)
      },
      clear: () => {
        strokes.current = []
        redraw()
        localStorage.setItem(STORAGE_KEY(fileIdRef.current), JSON.stringify(strokes.current))
        onCountRef.current?.(0)
      },
    }
  }, [markupHandleRef, redraw])

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    // touch-action:none prevents the browser from firing pointercancel
    // mid-stroke when it tries to start a pan gesture (even for pen pointers).
    touchAction: 'none',
    zIndex: 10,
    opacity: showMarkup ? 1 : 0,
  }

  return (
    <div
      ref={contentDivRef}
      className="markdown-viewer"
      style={{ position: 'relative', fontSize: `${14 * fontScale}px` }}
    >
      {/* Main canvas — completed strokes; receives pointer events */}
      <canvas
        ref={canvasRef}
        style={{
          ...canvasStyle,
          pointerEvents: markupEnabled ? 'auto' : 'none',
          cursor: markupEnabled ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'default',
        }}
      />
      {/* Overlay canvas — in-progress highlighter stroke; never receives events */}
      <canvas
        ref={overlayRef}
        style={{
          ...canvasStyle,
          zIndex: 11,
          pointerEvents: 'none',
        }}
      />

      {error
        ? <p style={{ color: 'var(--red)', fontSize: 13 }}>Markdown の読み込みに失敗しました</p>
        : content === null
          ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>読み込み中...</p>
          : <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
            >
              {rawMath ? content : preprocessMath(content)}
            </ReactMarkdown>
      }
    </div>
  )
}
