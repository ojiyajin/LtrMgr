import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { apiBase } from '../api/client'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

type Pt = { x: number; y: number }
type Stroke = { pts: Pt[]; color: string; width: number; eraser: boolean; page: number }

export function PdfMarkupViewer({ docId, fileId }: { docId: string; fileId: string }) {
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showMarkup, setShowMarkup] = useState(true)
  const [hasMarkup, setHasMarkup] = useState(false)

  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pdfCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const drawCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const strokes = useRef<Stroke[]>([])

  // Load strokes from localStorage (written by PdfMarkupPage)
  useEffect(() => {
    const saved = localStorage.getItem(`markup_${fileId}`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        strokes.current = parsed
        setHasMarkup(true)
      }
    } catch {}
  }, [fileId])

  useEffect(() => {
    pdfjsLib.getDocument({ url: `${apiBase}/documents/${docId}/files/${fileId}/view` }).promise
      .then((doc) => { docRef.current = doc; setNumPages(doc.numPages); setLoading(false) })
      .catch(() => setLoading(false))
  }, [docId, fileId])

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
      dc.width = Math.floor(hiVp.width)
      dc.height = Math.floor(hiVp.height)
      dc.style.width  = Math.floor(vp.width)  + 'px'
      dc.style.height = Math.floor(vp.height) + 'px'
      redrawPage(pageNum)
    }
  }, [redrawPage])

  const setPdfCanvas = useCallback((pageNum: number, el: HTMLCanvasElement | null) => {
    if (el) { pdfCanvases.current.set(pageNum, el); renderPage(pageNum) }
    else pdfCanvases.current.delete(pageNum)
  }, [renderPage])

  const setDrawCanvas = useCallback((pageNum: number, el: HTMLCanvasElement | null) => {
    if (el) drawCanvases.current.set(pageNum, el)
    else drawCanvases.current.delete(pageNum)
  }, [])

  return (
    <div>
      {hasMarkup && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => setShowMarkup(s => !s)}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6, fontWeight: 500,
              border: '1px solid #e2e8f0', cursor: 'pointer',
              background: showMarkup ? '#6366f1' : '#f1f5f9',
              color: showMarkup ? '#fff' : '#475569',
            }}
          >
            {showMarkup ? '描画を隠す' : '描画を表示'}
          </button>
        </div>
      )}

      <div style={{ maxHeight: 600, overflowY: 'auto', background: '#f1f5f9', borderRadius: 6, padding: 8 }}>
        {loading && (
          <p style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>PDF を読み込み中...</p>
        )}
        {!loading && numPages === 0 && (
          <p style={{ textAlign: 'center', padding: 40, color: '#f87171', fontSize: 14 }}>PDF が見つかりません</p>
        )}
        {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
          <div key={pageNum} style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
            <canvas ref={(el) => setPdfCanvas(pageNum, el)} style={{ display: 'block', borderRadius: 4 }} />
            <canvas
              ref={(el) => setDrawCanvas(pageNum, el)}
              style={{
                position: 'absolute', top: 0, left: 0, borderRadius: 4,
                pointerEvents: 'none',
                visibility: showMarkup ? 'visible' : 'hidden',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
