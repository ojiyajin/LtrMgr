import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DocumentSummary, ReadStatus } from '../types'
import { TagBadge } from './TagBadge'
import { updateReadStatus } from '../api/documents'

const TYPE_LABEL: Record<string, string> = { academic: '学術文献', patent: '特許', abstract: '学会要旨', textbook: '学習用テキスト' }
const TYPE_HUE: Record<string, { bg: string; text: string }> = {
  academic: { bg: 'rgba(77,141,245,0.14)',   text: '#4d8df5' },
  patent:   { bg: 'rgba(245,158,11,0.14)',   text: '#f59e0b' },
  abstract: { bg: 'rgba(63,176,106,0.14)',   text: '#3fb06a' },
  textbook: { bg: 'rgba(168,85,247,0.14)',   text: '#a855f7' },
}

const STATUS_CONFIG: Record<ReadStatus, { label: string; color: string; glow: string; next: ReadStatus }> = {
  unread:  { label: '未読',   color: '#4d5566', glow: 'none',                           next: 'reading' },
  reading: { label: '読書中', color: '#f59e0b', glow: '0 0 8px rgba(245,158,11,0.6)',   next: 'read' },
  read:    { label: '読了',   color: '#3fb06a', glow: '0 0 8px rgba(63,176,106,0.6)',   next: 'unread' },
}

export function DocumentCard({
  doc,
  index = 0,
  onOpen,
  selectMode = false,
  selected = false,
  onSelect,
  onLongPress,
}: {
  doc: DocumentSummary
  index?: number
  onOpen: (id: string) => void
  selectMode?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  onLongPress?: (id: string) => void
}) {
  const [showAbstract, setShowAbstract] = useState(false)
  const qc = useQueryClient()
  const { citation } = doc

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  function startLongPress(e: React.PointerEvent) {
    longPressFired.current = false
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onLongPress?.(doc.id)
    }, 500)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    pointerDownPos.current = null
  }

  function handlePointerMove(e: React.PointerEvent) {
    // ポインタが押下されていない（ホバー中）なら無視
    if (!pointerDownPos.current) return
    const dx = Math.abs(e.clientX - pointerDownPos.current.x)
    const dy = Math.abs(e.clientY - pointerDownPos.current.y)
    // 10px 以上動いたときだけキャンセル（タッチのわずかなブレは許容）
    if (dx > 10 || dy > 10) cancelLongPress()
  }

  function handleClick(e: React.MouseEvent) {
    if (longPressFired.current) { longPressFired.current = false; return }
    if (selectMode) { onSelect?.(doc.id) }
    else { onOpen(doc.id) }
  }

  const metaParts: string[] = []
  if (citation?.authors) {
    const first = citation.authors.split(',')[0].trim()
    metaParts.push(citation.authors.includes(',') ? `${first} ほか` : first)
  }
  if (citation?.journal)    metaParts.push(citation.journal)
  if (citation?.conference) metaParts.push(citation.conference)
  if (citation?.year)       metaParts.push(String(citation.year))

  const statusCfg = STATUS_CONFIG[doc.read_status as ReadStatus] ?? STATUS_CONFIG.unread
  const typeCfg   = TYPE_HUE[doc.doc_type] ?? TYPE_HUE.academic

  const statusMut = useMutation({
    mutationFn: (s: ReadStatus) => updateReadStatus(doc.id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })

  const hasActions = !!citation?.abstract_text || doc.pdf_files.length > 0

  return (
    <>
      <div
        className={`doc-card${selected ? ' doc-card--selected' : ''}`}
        style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, cursor: 'pointer' }}
        onClick={handleClick}
        onPointerDown={(e) => startLongPress(e)}
        onPointerUp={() => cancelLongPress()}
        onPointerCancel={() => cancelLongPress()}
        onPointerMove={(e) => handlePointerMove(e)}
      >
        {/* Checkbox — visible only in selectMode */}
        <div className={`doc-card-checkbox${selectMode ? ' visible' : ''}${selected ? ' checked' : ''}`}>
          {selected && '✓'}
        </div>

        {/* Left: status dot + type badge */}
        <div className="doc-card-left">
          <button
            title={`ステータス: ${statusCfg.label}（クリックで変更）`}
            onClick={(e) => { e.stopPropagation(); if (!selectMode) statusMut.mutate(statusCfg.next) }}
            className="doc-status-btn"
            style={{ background: statusCfg.color, boxShadow: statusCfg.glow }}
          />
          <span className="doc-type-badge" style={{ background: typeCfg.bg, color: typeCfg.text }}>
            {TYPE_LABEL[doc.doc_type]}
          </span>
        </div>

        {/* Body: title / meta / tags */}
        <div className="doc-card-body">
          <p className="doc-card-title">{doc.title}</p>
          {metaParts.length > 0 && <p className="doc-card-meta">{metaParts.join(' · ')}</p>}
          {doc.tags.length > 0 && (
            <div className="doc-card-tags">
              {doc.tags.map((t) => <TagBadge key={t.id} tag={t} />)}
            </div>
          )}
        </div>

        {/* Right: compact action buttons — hidden in selectMode */}
        {hasActions && !selectMode && (
          <div className="doc-card-right">
            {citation?.abstract_text && (
              <button
                className="abstract-btn"
                onClick={(e) => { e.stopPropagation(); setShowAbstract(true) }}
              >
                要旨
              </button>
            )}
            {doc.pdf_files.map((pf) => (
              <a
                key={pf.id}
                href={pf.filename.endsWith('.md')
                  ? `#/documents/${doc.id}/markdown/${pf.id}`
                  : `#/documents/${doc.id}/markup/${pf.id}`}
                target="_blank"
                rel="noreferrer"
                className="pdf-btn"
                onClick={(e) => e.stopPropagation()}
                title={pf.filename}
              >
                {pf.filename.endsWith('.md') ? 'MD' : 'PDF'}
              </a>
            ))}
          </div>
        )}
      </div>

      {showAbstract && (
        <div className="modal-overlay" onClick={() => setShowAbstract(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{doc.title}</h3>
            <p className="modal-abstract-text">{citation?.abstract_text}</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAbstract(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
