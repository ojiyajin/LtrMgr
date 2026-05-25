import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { getFileContent } from '../api/documents'
import { preprocessMath } from '../utils/mathPreprocess'

type Pt = { x: number; y: number }
type MdStroke = { pts: Pt[]; color: string; width: number; eraser: boolean; highlighter: boolean }

export interface MarkdownMarkupHandle {
  undo: () => void
  clear: () => void
}

interface Props {
  docId: string
  fileId: string
  fontScale?: number
  markupEnabled?: boolean
  tool?: 'pen' | 'highlighter' | 'eraser'
  color?: string
  lineWidth?: number
  showMarkup?: boolean
  onStrokeCountChange?: (n: number) => void
  markupHandleRef?: React.MutableRefObject<MarkdownMarkupHandle | null>
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

export function MarkdownViewer({
  docId,
  fileId,
  fontScale = 1,
  markupEnabled = false,
  tool = 'pen',
  color = '#ef4444',
  lineWidth = 4,
  showMarkup = true,
  onStrokeCountChange,
  markupHandleRef,
  scrollRef,
}: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const contentDivRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<MdStroke[]>([])
  const drawing = useRef(false)
  const curPts = useRef<Pt[]>([])
  const canvasRectRef = useRef<DOMRect | null>(null)
  // For touch scroll relay when markupEnabled
  const touchScrollStart = useRef<{ y: number; scrollTop: number } | null>(null)

  // Mutable refs — native event handlers read these without stale closures
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  const lineWidthRef = useRef(lineWidth)
  const markupEnabledRef = useRef(markupEnabled)
  const fileIdRef = useRef(fileId)
  const onCountRef = useRef(onStrokeCountChange)
  const scrollRefRef = useRef(scrollRef)
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
      .then(text => setContent(text))
      .catch(() => setError(true))
  }, [docId, fileId])

  // Load saved strokes from localStorage whenever file changes
  useEffect(() => {
    strokes.current = []
    const saved = localStorage.getItem(`md_markup_${fileId}`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        strokes.current = parsed
        onCountRef.current?.(parsed.length)
      }
    } catch {}
  }, [fileId])

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
      ctx.moveTo(s.pts[0].x * dpr, s.pts[0].y * dpr)
      for (const p of s.pts.slice(1)) ctx.lineTo(p.x * dpr, p.y * dpr)
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  // Resize canvas to match the content div's natural (layout) dimensions.
  // fontScale changes the font-size, causing the content div to grow/shrink naturally.
  // The canvas must match the content div's natural dimensions exactly.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const div = contentDivRef.current
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
      redraw()
    }
  }, [redraw])

  // ResizeObserver: keep canvas sized to content at all times.
  useEffect(() => {
    const div = contentDivRef.current
    if (!div) return
    const ro = new ResizeObserver(resizeCanvas)
    ro.observe(div)
    resizeCanvas()
    return () => ro.disconnect()
  }, [resizeCanvas])

  // Re-size canvas whenever fontScale changes (content reflows with new font-size).
  useEffect(() => {
    resizeCanvas()
  }, [fontScale, resizeCanvas])

  // Attach native pointer event listeners to the canvas ONCE on mount.
  // IMPORTANT: the canvas element is always rendered (never conditionally removed),
  // so canvasRef.current is guaranteed to be non-null here.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const saveStrokes = () =>
      localStorage.setItem(`md_markup_${fileIdRef.current}`, JSON.stringify(strokes.current))

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        // Touch/mouse: relay scroll to the parent container
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
      canvasRectRef.current = canvas.getBoundingClientRect()
      const r = canvasRectRef.current
      const dpr = window.devicePixelRatio || 1
      curPts.current = [{
        x: (e.clientX - r.left) / r.width  * canvas.width  / dpr,
        y: (e.clientY - r.top)  / r.height * canvas.height / dpr,
      }]
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') {
        // Relay finger scroll to the parent scroll container
        if (e.pointerType === 'touch' && touchScrollStart.current) {
          const sc = scrollRefRef.current?.current
          if (sc) sc.scrollTop = touchScrollStart.current.scrollTop + (touchScrollStart.current.y - e.clientY)
        }
        return
      }
      if (!drawing.current) return
      e.preventDefault()
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
      const r = canvasRectRef.current
      if (!r) return
      const dpr = window.devicePixelRatio || 1
      const ctx = canvas.getContext('2d')!
      const t = toolRef.current

      if (t === 'highlighter') {
        // Accumulate all new points first, then clear-and-redraw the whole canvas.
        // Incremental segment drawing causes globalAlpha to accumulate at each
        // overlap point, making the stroke appear far too dark. Drawing the entire
        // current stroke as one single path avoids this entirely.
        for (const ev of evs) {
          curPts.current.push({
            x: (ev.clientX - r.left) / r.width  * canvas.width  / dpr,
            y: (ev.clientY - r.top)  / r.height * canvas.height / dpr,
          })
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        // Redraw all completed strokes
        for (const s of strokes.current) {
          if (s.pts.length < 2) continue
          ctx.save()
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'
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
          ctx.moveTo(s.pts[0].x * dpr, s.pts[0].y * dpr)
          for (const p of s.pts.slice(1)) ctx.lineTo(p.x * dpr, p.y * dpr)
          ctx.stroke()
          ctx.restore()
        }
        // Draw current in-progress stroke as a single complete path (no accumulation)
        if (curPts.current.length >= 2) {
          ctx.save()
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 0.38
          ctx.strokeStyle = colorRef.current
          ctx.lineWidth = lineWidthRef.current * 8 * dpr
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(curPts.current[0].x * dpr, curPts.current[0].y * dpr)
          for (const p of curPts.current.slice(1)) ctx.lineTo(p.x * dpr, p.y * dpr)
          ctx.stroke()
          ctx.restore()
        }
      } else {
        // Pen / eraser: incremental drawing is fine (no alpha accumulation)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (t === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out'
          ctx.strokeStyle = 'rgba(0,0,0,1)'
          ctx.lineWidth = lineWidthRef.current * 4 * dpr
        } else {
          ctx.globalCompositeOperation = 'source-over'
          ctx.strokeStyle = colorRef.current
          ctx.lineWidth = lineWidthRef.current * dpr
        }
        ctx.beginPath()
        let drewAny = false
        for (const ev of evs) {
          const pt = {
            x: (ev.clientX - r.left) / r.width  * canvas.width  / dpr,
            y: (ev.clientY - r.top)  / r.height * canvas.height / dpr,
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
        saveStrokes()
        onCountRef.current?.(strokes.current.length)
      }
      curPts.current = []
    }

    // passive: false on pointerdown so e.preventDefault() suppresses browser scroll/cancel
    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup',   onUp)
    canvas.addEventListener('pointercancel', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup',   onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, []) // [] — only mutable refs used inside; no stale closure risk

  // Expose undo/clear to the parent via handle ref
  useEffect(() => {
    if (!markupHandleRef) return
    markupHandleRef.current = {
      undo: () => {
        if (!strokes.current.length) return
        strokes.current = strokes.current.slice(0, -1)
        redraw()
        localStorage.setItem(`md_markup_${fileIdRef.current}`, JSON.stringify(strokes.current))
        onCountRef.current?.(strokes.current.length)
      },
      clear: () => {
        strokes.current = []
        redraw()
        localStorage.setItem(`md_markup_${fileIdRef.current}`, JSON.stringify(strokes.current))
        onCountRef.current?.(0)
      },
    }
  }, [markupHandleRef, redraw])

  // NOTE: The canvas is rendered unconditionally so it is always in the DOM.
  // This ensures the useEffect([]) above can attach listeners on mount.
  // Loading / error states are shown INSIDE the same wrapper div.
  return (
    <div
      ref={contentDivRef}
      className="markdown-viewer"
      style={{ position: 'relative', fontSize: `${14 * fontScale}px` }}
    >
      {/* Canvas is always present — covers the full content area.
          touch-action:none prevents the browser from stealing pen pointer events
          (with pan-y the browser fires pointercancel mid-stroke). Finger scroll
          is handled manually via the touchScrollStart relay above. */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          touchAction: 'none',
          pointerEvents: markupEnabled ? 'auto' : 'none',
          zIndex: 10,
          opacity: showMarkup ? 1 : 0,
          cursor: markupEnabled ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'default',
        }}
      />

      {error
        ? <p style={{ color: 'var(--red)', fontSize: 13 }}>Markdown の読み込みに失敗しました</p>
        : content === null
          ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>読み込み中...</p>
          : <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
            >
              {preprocessMath(content)}
            </ReactMarkdown>
      }
    </div>
  )
}
