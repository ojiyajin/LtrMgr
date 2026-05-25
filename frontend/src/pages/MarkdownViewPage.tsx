import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDocument, getFileContent, updateFileContent } from '../api/documents'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { NotesPanel } from '../components/NotesPanel'
import { DeadZonePanel } from '../components/DeadZonePanel'
import { loadDeadZone, isInDeadZone, type DeadZoneConfig } from '../store/deadZone'
import { preprocessMath } from '../utils/mathPreprocess'

const FONT_SIZES = [
  { key: 'small',  label: '小', zoom: 0.85 },
  { key: 'medium', label: '中', zoom: 1.0  },
  { key: 'large',  label: '大', zoom: 1.3  },
  { key: 'xlarge', label: '特大', zoom: 1.6 },
] as const

type FontSizeKey = typeof FONT_SIZES[number]['key']
type Anchor = { lineText: string; frac: number }

function cleanText(s: string): string {
  return s.replace(/[*_`#\[\]()\\$\-=+|>!]/g, '').replace(/\s+/g, ' ').trim()
}

export function MarkdownViewPage() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showNotes, setShowNotes] = useState(false)
  const [showDeadZone, setShowDeadZone] = useState(false)
  const [deadZoneCfg, setDeadZoneCfg] = useState<DeadZoneConfig>(() => loadDeadZone())
  const deadZoneRef = useRef<DeadZoneConfig>(deadZoneCfg)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState<FontSizeKey>('medium')
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewerKey, setViewerKey] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarH, setToolbarH] = useState(0)
  const toolbarHRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingAnchorRef = useRef<Anchor | null>(null)

  const { data: doc } = useQuery({ queryKey: ['document', id], queryFn: () => getDocument(id!) })
  const notes = doc?.notes ?? []

  const currentZoom = FONT_SIZES.find(f => f.key === fontSize)?.zoom ?? 1.0

  // ── Anchor helpers ─────────────────────────────────────────────────────────

  // Find the first meaningful element visible at the top of the viewer, return its text + fraction.
  function captureViewerAnchor(): Anchor {
    const sc = scrollContainerRef.current
    if (!sc) return { lineText: '', frac: 0 }
    const max = sc.scrollHeight - sc.clientHeight
    const frac = max > 0 ? sc.scrollTop / max : 0

    const scRect = sc.getBoundingClientRect()
    const els = Array.from(sc.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,td,blockquote'))
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom > scRect.top + 4) {
        const text = cleanText(el.textContent ?? '').slice(0, 50)
        if (text.length >= 3) return { lineText: text, frac }
      }
    }
    return { lineText: '', frac }
  }

  // Scroll textarea to show the line matching the anchor text.
  function applyTextareaAnchor(anchor: Anchor) {
    const ta = textareaRef.current
    if (!ta) return

    if (anchor.lineText) {
      const needle = anchor.lineText.slice(0, 25).toLowerCase()
      const lines = ta.value.split('\n')
      const lineH = ta.scrollHeight / Math.max(1, lines.length)

      // Exact prefix match first
      for (let i = 0; i < lines.length; i++) {
        const hay = cleanText(lines[i]).slice(0, 25).toLowerCase()
        if (hay.length >= 3 && hay === needle) { ta.scrollTop = Math.max(0, i * lineH); return }
      }
      // Fuzzy: needle starts with line content
      for (let i = 0; i < lines.length; i++) {
        const hay = cleanText(lines[i]).slice(0, 20).toLowerCase()
        if (hay.length >= 3 && needle.startsWith(hay)) { ta.scrollTop = Math.max(0, i * lineH); return }
      }
    }
    // Fallback: fraction
    ta.scrollTop = anchor.frac * Math.max(0, ta.scrollHeight - ta.clientHeight)
  }

  // Find the top-visible line in the textarea and return its text + fraction.
  function captureTextareaAnchor(): Anchor {
    const ta = textareaRef.current
    if (!ta) return { lineText: '', frac: 0 }
    const max = ta.scrollHeight - ta.clientHeight
    const frac = max > 0 ? ta.scrollTop / max : 0

    const lines = ta.value.split('\n')
    const lineH = ta.scrollHeight / Math.max(1, lines.length)
    const topIdx = Math.floor(ta.scrollTop / lineH)
    for (let i = topIdx; i < Math.min(topIdx + 4, lines.length); i++) {
      const text = cleanText(lines[i]).slice(0, 50)
      if (text.length >= 3) return { lineText: text, frac }
    }
    return { lineText: '', frac }
  }

  // Scroll viewer to show the element matching the anchor text.
  // Retries via rAF until content is rendered (for post-save reload).
  function applyViewerAnchor(anchor: Anchor, retries = 80) {
    const sc = scrollContainerRef.current
    if (!sc) return
    const max = sc.scrollHeight - sc.clientHeight
    if (max <= 0) {
      if (retries > 0) requestAnimationFrame(() => applyViewerAnchor(anchor, retries - 1))
      return
    }

    if (anchor.lineText) {
      const needle = anchor.lineText.slice(0, 25).toLowerCase()
      const els = Array.from(sc.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,td,blockquote'))
      const scRect = sc.getBoundingClientRect()

      for (const el of els) {
        const text = cleanText(el.textContent ?? '').slice(0, 25).toLowerCase()
        if (text.length >= 3 && (text === needle || needle.startsWith(text) || text.startsWith(needle.slice(0, 15)))) {
          const rect = el.getBoundingClientRect()
          sc.scrollTop += rect.top - scRect.top
          return
        }
      }
    }
    sc.scrollTop = anchor.frac * max
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────

  async function handleOpenEdit() {
    try {
      const text = await getFileContent(id!, fileId!)
      pendingAnchorRef.current = captureViewerAnchor()
      setEditText(text)
      setEditMode(true)
    } catch {
      alert('ファイルの読み込みに失敗しました')
    }
  }

  async function handleSave() {
    pendingAnchorRef.current = captureTextareaAnchor()
    setSaving(true)
    try {
      await updateFileContent(id!, fileId!, editText)
      await qc.invalidateQueries({ queryKey: ['document', id] })
      setEditMode(false)
      setViewerKey(k => k + 1)
    } catch {
      alert('保存に失敗しました')
      pendingAnchorRef.current = null
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    pendingAnchorRef.current = captureTextareaAnchor()
    setEditMode(false)
  }

  // Auto-enter edit mode when opened with ?edit=1 (e.g. from "新規Markdownを作成")
  useEffect(() => {
    if (searchParams.get('edit') !== '1') return
    getFileContent(id!, fileId!)
      .then(text => { setEditText(text); setEditMode(true) })
      .catch(() => { /* user can click 編集 manually */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply scroll anchor whenever editMode changes
  useEffect(() => {
    const anchor = pendingAnchorRef.current
    if (!anchor) return
    pendingAnchorRef.current = null

    if (editMode) {
      // Viewer → textarea: apply after textarea has rendered
      requestAnimationFrame(() => applyTextareaAnchor(anchor))
    } else {
      // Textarea → viewer: content may need to load first (post-save)
      applyViewerAnchor(anchor)
    }
  }, [editMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toolbar height ─────────────────────────────────────────────────────────

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

  // ── Dead zone scroll handling ──────────────────────────────────────────────
  // We do NOT call e.preventDefault() in touchstart — doing so tells iOS Safari
  // to suppress click events for ALL concurrent touches, breaking toolbar buttons.
  // Calling e.preventDefault() only in touchmove is enough to block native scroll.
  // Overlays are pointer-events:none (visual only) so no touchAction:none is needed,
  // which avoids iOS's "gesture session" suppression of clicks on other elements.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const deadIds = new Set<number>()
    let scrollRef: { y: number; scrollTop: number } | null = null

    const syncDeadIds = (touches: TouchList) => {
      const current = new Set(Array.from(touches).map(t => t.identifier))
      for (const id of [...deadIds]) { if (!current.has(id)) deadIds.delete(id) }
      for (const t of Array.from(touches)) {
        if (isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current))
          deadIds.add(t.identifier)
      }
    }

    const active = (touches: TouchList) =>
      Array.from(touches).filter(t => !deadIds.has(t.identifier))

    const onTouchStart = (e: TouchEvent) => {
      syncDeadIds(e.touches)

      // Prevent iOS long-press text selection for touches that start in the dead zone.
      // We call preventDefault() only for changedTouches that are in the dead zone, so
      // click events from non-dead-zone touches are NOT suppressed.
      const deadChanged = Array.from(e.changedTouches).some(t =>
        isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current)
      )
      if (deadChanged) {
        e.preventDefault()
        // Also suppress CSS text selection while any dead-zone touch is active
        el.style.userSelect = 'none'
        ;(el.style as any).webkitUserSelect = 'none'
      }

      if (deadIds.size === 0) return
      const act = active(e.touches)
      scrollRef = act.length === 1
        ? { y: act[0].clientY, scrollTop: el.scrollTop }
        : null
    }

    const onTouchMove = (e: TouchEvent) => {
      if (deadIds.size === 0) return
      e.preventDefault() // safe: touchmove preventDefault does NOT suppress clicks
      const act = active(e.touches)
      if (act.length === 1 && scrollRef !== null)
        el.scrollTop = scrollRef.scrollTop + (scrollRef.y - act[0].clientY)
    }

    const onTouchEnd = (e: TouchEvent) => {
      syncDeadIds(e.touches)
      // Restore text selection once all dead-zone touches have lifted
      if (deadIds.size === 0) {
        el.style.userSelect = 'text'
        ;(el.style as any).webkitUserSelect = 'text'
        scrollRef = null
        return
      }
      const act = active(e.touches)
      scrollRef = act.length === 1
        ? { y: act[0].clientY, scrollTop: el.scrollTop }
        : null
    }

    const onContextMenu = (e: MouseEvent) => {
      if (isInDeadZone(e.clientX, e.clientY, deadZoneRef.current, toolbarHRef.current))
        e.preventDefault()
    }

    // passive: false so we can call e.preventDefault() in onTouchStart for dead-zone touches
    el.addEventListener('touchstart',   onTouchStart,   { passive: false })
    el.addEventListener('touchmove',    onTouchMove,    { passive: false })
    el.addEventListener('touchend',     onTouchEnd,     { passive: true  })
    el.addEventListener('contextmenu',  onContextMenu)
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#0f172a', userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* Toolbar */}
      <div ref={toolbarRef} style={{
        flexShrink: 0, background: '#0c1220', borderBottom: '1px solid #1e3a5f',
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', flexWrap: 'wrap',
        position: 'relative', zIndex: 20,
      }}>
        <button
          onClick={() => window.close()}
          style={{ color: '#94a3b8', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', padding: '4px 8px' }}
        >
          ✕ 閉じる
        </button>
        <div style={{ width: 1, height: 20, background: '#1e3a5f' }} />
        <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {doc?.title ?? '読み込み中...'}
        </span>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {FONT_SIZES.map(f => (
            <button
              key={f.key}
              onClick={() => setFontSize(f.key)}
              style={{
                padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: fontSize === f.key ? '#334155' : 'transparent',
                color: fontSize === f.key ? '#e2e8f0' : '#64748b',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: '#1e3a5f' }} />
        {editMode ? (
          <>
            <button
              onClick={() => setEditText(preprocessMath(editText))}
              title="数式のない行に $$ を付与"
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#94a3b8' }}
            >
              数式を展開
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#22c55e', color: '#fff' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={handleCancel}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#94a3b8' }}
            >
              キャンセル
            </button>
          </>
        ) : (
          <button
            onClick={handleOpenEdit}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#94a3b8' }}
          >
            編集
          </button>
        )}
        <button
          onClick={() => setShowNotes(s => !s)}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            background: showNotes ? '#6366f1' : 'transparent',
            color: showNotes ? '#fff' : '#94a3b8',
          }}
        >
          メモ {notes.length > 0 ? `(${notes.length})` : ''}
        </button>
        <button
          onClick={() => setShowDeadZone(s => !s)}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            background: showDeadZone ? '#d4a843' : 'transparent',
            color: showDeadZone ? '#0c0e12' : '#94a3b8',
          }}
        >
          不感領域
        </button>
      </div>

      {/* Content */}
      {editMode ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', background: '#0f172a', overflow: 'hidden' }}>
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            style={{
              flex: 1, width: '100%', padding: '16px',
              background: '#111318', color: '#e2e6ef',
              border: '1px solid #2c303a', borderRadius: 8,
              fontSize: 14, fontFamily: 'monospace', resize: 'none',
              outline: 'none', lineHeight: 1.7,
            }}
          />
        </div>
      ) : (
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', background: '#fff', userSelect: 'text', WebkitUserSelect: 'text' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px 80px', zoom: currentZoom }}>
            <MarkdownViewer key={viewerKey} docId={id!} fileId={fileId!} />
          </div>
        </div>
      )}

      <NotesPanel show={showNotes} docId={id!} notes={notes} />
      <DeadZonePanel
        show={showDeadZone}
        onClose={() => setShowDeadZone(false)}
        onChange={cfg => { deadZoneRef.current = cfg; setDeadZoneCfg(cfg) }}
      />
      {/* Overlays are pointer-events:none (visual only). Touch detection is done entirely
          in JS via e.touches (global list), which includes touches on any element. */}
      {deadZoneCfg.left   > 0 && <div style={{ position: 'fixed', left: 0,   top: toolbarH, bottom: 0, width:  deadZoneCfg.left,   background: 'rgba(212,168,67,0.08)', borderRight: '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.right  > 0 && <div style={{ position: 'fixed', right: 0,  top: toolbarH, bottom: 0, width:  deadZoneCfg.right,  background: 'rgba(212,168,67,0.08)', borderLeft:  '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.top    > 0 && <div style={{ position: 'fixed', top: toolbarH, left: 0, right: 0, height: deadZoneCfg.top,    background: 'rgba(212,168,67,0.08)', borderBottom:'1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.bottom > 0 && <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: deadZoneCfg.bottom, background: 'rgba(212,168,67,0.08)', borderTop:   '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
    </div>
  )
}
