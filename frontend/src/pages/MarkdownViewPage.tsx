import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDocument, getFileContent, updateFileContent } from '../api/documents'
import { MarkdownViewer, type MarkdownMarkupHandle } from '../components/MarkdownViewer'
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

const PEN_COLORS   = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#a855f7']
const HL_COLORS    = ['#fde047', '#86efac', '#67e8f9', '#f9a8d4', '#fdba74', '#c4b5fd']
const MARKUP_WIDTHS = [2, 4, 7, 13]

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

  // ── Markup state ───────────────────────────────────────────────────────────
  const [markupEnabled, setMarkupEnabled] = useState(false)
  const [markupTool, setMarkupTool] = useState<'pen' | 'highlighter' | 'eraser'>('highlighter')
  const [markupColor, setMarkupColor] = useState('#fde047')
  const [markupWidth, setMarkupWidth] = useState(7)
  const [markupStrokeCount, setMarkupStrokeCount] = useState(0)
  const [showMarkupCanvas, setShowMarkupCanvas] = useState(true)
  const markupHandleRef = useRef<MarkdownMarkupHandle | null>(null)

  const { data: doc } = useQuery({ queryKey: ['document', id], queryFn: () => getDocument(id!) })
  const notes = doc?.notes ?? []

  const currentZoom = FONT_SIZES.find(f => f.key === fontSize)?.zoom ?? 1.0

  // ── Anchor helpers ─────────────────────────────────────────────────────────

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

  function applyTextareaAnchor(anchor: Anchor) {
    const ta = textareaRef.current
    if (!ta) return
    if (anchor.lineText) {
      const needle = anchor.lineText.slice(0, 25).toLowerCase()
      const lines = ta.value.split('\n')
      const lineH = ta.scrollHeight / Math.max(1, lines.length)
      for (let i = 0; i < lines.length; i++) {
        const hay = cleanText(lines[i]).slice(0, 25).toLowerCase()
        if (hay.length >= 3 && hay === needle) { ta.scrollTop = Math.max(0, i * lineH); return }
      }
      for (let i = 0; i < lines.length; i++) {
        const hay = cleanText(lines[i]).slice(0, 20).toLowerCase()
        if (hay.length >= 3 && needle.startsWith(hay)) { ta.scrollTop = Math.max(0, i * lineH); return }
      }
    }
    ta.scrollTop = anchor.frac * Math.max(0, ta.scrollHeight - ta.clientHeight)
  }

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

  useEffect(() => {
    if (searchParams.get('edit') !== '1') return
    getFileContent(id!, fileId!)
      .then(text => { setEditText(text); setEditMode(true) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const anchor = pendingAnchorRef.current
    if (!anchor) return
    pendingAnchorRef.current = null
    if (editMode) {
      requestAnimationFrame(() => applyTextareaAnchor(anchor))
    } else {
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
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const deadIds = new Set<number>()
    let scrollRef: { y: number; scrollTop: number } | null = null

    const syncDeadIds = (touches: TouchList) => {
      const current = new Set(Array.from(touches).map(t => t.identifier))
      for (const id of [...deadIds]) { if (!current.has(id)) deadIds.delete(id) }
      for (const t of Array.from(touches)) {
        if ((t as any).touchType === 'stylus') continue  // Apple Pencil never enters dead zone
        if (isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current))
          deadIds.add(t.identifier)
      }
    }

    const active = (touches: TouchList) =>
      Array.from(touches).filter(t => !deadIds.has(t.identifier))

    const onTouchStart = (e: TouchEvent) => {
      syncDeadIds(e.touches)
      // preventDefault only for finger touches in dead zone (not stylus)
      const deadChanged = Array.from(e.changedTouches).some(t =>
        (t as any).touchType !== 'stylus' &&
        isInDeadZone(t.clientX, t.clientY, deadZoneRef.current, toolbarHRef.current)
      )
      if (deadChanged) {
        e.preventDefault()
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
      e.preventDefault()
      const act = active(e.touches)
      if (act.length === 1 && scrollRef !== null)
        el.scrollTop = scrollRef.scrollTop + (scrollRef.y - act[0].clientY)
    }

    const onTouchEnd = (e: TouchEvent) => {
      syncDeadIds(e.touches)
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

    el.addEventListener('touchstart',  onTouchStart,  { passive: false })
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true  })
    el.addEventListener('contextmenu', onContextMenu)
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeColors = markupTool === 'highlighter' ? HL_COLORS : PEN_COLORS

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#0f172a', userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* Toolbar wrapper — ref covers both rows for dead-zone offset */}
      <div ref={toolbarRef} style={{ flexShrink: 0 }}>
        {/* Main toolbar */}
        <div style={{
          background: '#0c1220', borderBottom: '1px solid #1e3a5f',
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
          {!editMode && (
            <button
              onClick={() => setMarkupEnabled(s => !s)}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: markupEnabled ? '#f59e0b' : 'transparent',
                color: markupEnabled ? '#0c0e12' : '#94a3b8',
              }}
            >
              マーカー{markupStrokeCount > 0 ? ` (${markupStrokeCount})` : ''}
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

        {/* Markup secondary toolbar — visible when markup mode is on */}
        {markupEnabled && !editMode && (
          <div style={{
            background: '#0a1628', borderBottom: '1px solid #1e3a5f',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '6px 14px',
          }}>
            {/* Tool selector */}
            {(['highlighter', 'pen', 'eraser'] as const).map(t => (
              <MkBtn key={t} active={markupTool === t} onClick={() => setMarkupTool(t)}>
                {t === 'highlighter' ? 'マーカー' : t === 'pen' ? 'ペン' : '消しゴム'}
              </MkBtn>
            ))}
            <MkSep />
            {/* Colors — hidden for eraser */}
            {markupTool !== 'eraser' && activeColors.map(c => (
              <button
                key={c}
                onClick={() => setMarkupColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                  background: c, border: markupColor === c ? '3px solid #6366f1' : '2px solid #334155',
                  opacity: markupTool === 'highlighter' ? 0.75 : 1,
                }}
              />
            ))}
            {markupTool !== 'eraser' && <MkSep />}
            {/* Width selector */}
            {MARKUP_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => setMarkupWidth(w)}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, border: 'none',
                  background: markupWidth === w ? '#334155' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: Math.min(w * (markupTool === 'highlighter' ? 2 : 1), 18),
                  height: Math.min(w * (markupTool === 'highlighter' ? 2 : 1), 18),
                  borderRadius: markupTool === 'highlighter' ? 3 : '50%',
                  background: markupTool !== 'eraser' ? markupColor : '#94a3b8',
                  opacity: markupTool === 'highlighter' ? 0.6 : 1,
                }} />
              </button>
            ))}
            <MkSep />
            {/* Undo / Clear */}
            <MkBtn active={false} disabled={markupStrokeCount === 0} onClick={() => markupHandleRef.current?.undo()}>
              元に戻す
            </MkBtn>
            <MkBtn
              active={false}
              disabled={markupStrokeCount === 0}
              onClick={() => markupHandleRef.current?.clear()}
              style={{ color: markupStrokeCount > 0 ? '#f87171' : undefined }}
            >
              全消去
            </MkBtn>
            <MkSep />
            {/* Show/hide toggle */}
            <MkBtn active={!showMarkupCanvas} onClick={() => setShowMarkupCanvas(s => !s)}>
              {showMarkupCanvas ? '描画を隠す' : '描画を表示'}
            </MkBtn>
          </div>
        )}
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
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px 80px' }}>
            <MarkdownViewer
              key={viewerKey}
              docId={id!}
              fileId={fileId!}
              fontScale={currentZoom}
              markupEnabled={markupEnabled}
              tool={markupTool}
              color={markupColor}
              lineWidth={markupWidth}
              showMarkup={showMarkupCanvas}
              onStrokeCountChange={setMarkupStrokeCount}
              markupHandleRef={markupHandleRef}
              scrollRef={scrollContainerRef}
            />
          </div>
        </div>
      )}

      <NotesPanel show={showNotes} docId={id!} notes={notes} />
      <DeadZonePanel
        show={showDeadZone}
        onClose={() => setShowDeadZone(false)}
        onChange={cfg => { deadZoneRef.current = cfg; setDeadZoneCfg(cfg) }}
      />
      {deadZoneCfg.left   > 0 && <div style={{ position: 'fixed', left: 0,   top: toolbarH, bottom: 0, width:  deadZoneCfg.left,   background: 'rgba(212,168,67,0.08)', borderRight: '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.right  > 0 && <div style={{ position: 'fixed', right: 0,  top: toolbarH, bottom: 0, width:  deadZoneCfg.right,  background: 'rgba(212,168,67,0.08)', borderLeft:  '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.top    > 0 && <div style={{ position: 'fixed', top: toolbarH, left: 0, right: 0, height: deadZoneCfg.top,    background: 'rgba(212,168,67,0.08)', borderBottom:'1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
      {deadZoneCfg.bottom > 0 && <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: deadZoneCfg.bottom, background: 'rgba(212,168,67,0.08)', borderTop:   '1px solid rgba(212,168,67,0.3)', pointerEvents: 'none', zIndex: 10 }} />}
    </div>
  )
}

function MkSep() {
  return <div style={{ width: 1, height: 24, background: '#1e3a5f', flexShrink: 0 }} />
}

function MkBtn({ active, onClick, children, disabled, style }: {
  active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px', borderRadius: 6, border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 11, fontWeight: 600, flexShrink: 0,
        background: active ? '#6366f1' : 'transparent',
        color: active ? '#fff' : disabled ? '#4b5563' : '#94a3b8',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
