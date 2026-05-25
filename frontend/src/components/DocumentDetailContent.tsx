import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDocument, deleteDocument, uploadPDF, deletePDF, getPDFDownloadUrl,
  fetchPDFFromDOI, updateReadStatus, checkDuplicate, updateFileContent,
  updateDocument, renameFile,
} from '../api/documents'
import { listCollections, addToCollection, removeFromCollection } from '../api/collections'
import { exportDocuments } from '../api/export'
import type { PDFUploadResult, ReadStatus } from '../types'
import { createNote, updateNote, deleteNote } from '../api/notes'
import { TagBadge } from './TagBadge'
import { NoteEditor } from './NoteEditor'
import { PdfMarkupViewer } from './PdfMarkupViewer'
import { MarkdownViewer } from './MarkdownViewer'
import { CitationFormatter } from './CitationFormatter'

const TYPE_LABEL: Record<string, string> = { academic: '学術文献', patent: '特許', abstract: '学会要旨', textbook: '学習用テキスト' }
const TYPE_HUE: Record<string, { bg: string; text: string }> = {
  academic: { bg: 'rgba(77,141,245,0.14)',  text: '#4d8df5' },
  patent:   { bg: 'rgba(245,158,11,0.14)',  text: '#f59e0b' },
  abstract: { bg: 'rgba(63,176,106,0.14)',  text: '#3fb06a' },
  textbook: { bg: 'rgba(168,85,247,0.14)',  text: '#a855f7' },
}

const STATUS_CONFIG: Record<ReadStatus, { label: string; color: string; next: ReadStatus }> = {
  unread:  { label: '未読',   color: '#4d5566', next: 'reading' },
  reading: { label: '読書中', color: '#f59e0b', next: 'read' },
  read:    { label: '読了',   color: '#3fb06a', next: 'unread' },
}

const fileIconLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 5, border: 'none',
  background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)',
  textDecoration: 'none', flexShrink: 0,
}

function FileIconBtn({ title, active, danger, onClick, children }: {
  title: string; active?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: active ? 'var(--accent)' : danger ? 'var(--red)' : 'var(--text-dim)',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  )
}

function IconExternalLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  )
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null
  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <span className="detail-row-value">{value}</span>
    </div>
  )
}

export function DocumentDetailContent({ docId, onClose }: { docId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [inlineEditFileId, setInlineEditFileId] = useState<string | null>(null)
  const [inlineEditText, setInlineEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploadResult, setUploadResult] = useState<PDFUploadResult | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', docId],
    queryFn: () => getDocument(docId),
  })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: listCollections })
  const { data: dupCheck } = useQuery({
    queryKey: ['duplicate', doc?.citation?.doi, doc?.citation?.doi ? null : doc?.title],
    queryFn: () => checkDuplicate(doc?.citation?.doi ?? undefined, doc?.citation?.doi ? undefined : doc?.title, docId),
    enabled: !!doc,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['document', docId] })
    qc.invalidateQueries({ queryKey: ['documents'] })
  }

  const deleteMut = useMutation({
    mutationFn: () => deleteDocument(docId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); onClose() },
  })
  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadPDF(docId, file),
    onSuccess: (result) => { setUploadResult(result); invalidate() },
  })
  const fetchPdfMut = useMutation({ mutationFn: () => fetchPDFFromDOI(docId), onSuccess: invalidate })
  const deleteFileMut = useMutation({
    mutationFn: (fileId: string) => deletePDF(docId, fileId),
    onSuccess: (_, fileId) => {
      if (previewFileId === fileId) setPreviewFileId(null)
      invalidate()
    },
  })
  const createMdMut = useMutation({
    mutationFn: (name: string) => uploadPDF(docId, new File([''], name, { type: 'text/markdown' })),
    onSuccess: (result) => {
      // Optimistically inject the new file into the cache so the inline editor
      // appears immediately without waiting for the background refetch to complete.
      qc.setQueryData(['document', docId], (old: any) => {
        if (!old) return old
        const already = old.pdf_files.some((f: any) => f.id === result.id)
        if (already) return old
        return { ...old, pdf_files: [...old.pdf_files, { id: result.id, filename: result.filename, uploaded_at: result.uploaded_at }] }
      })
      setInlineEditFileId(result.id)
      setInlineEditText('')
      invalidate()
    },
  })
  const inlineSaveMut = useMutation({
    mutationFn: (content: string) => updateFileContent(docId, inlineEditFileId!, content),
    onSuccess: () => { setInlineEditFileId(null); invalidate() },
  })
  const updateTitleMut = useMutation({
    mutationFn: (title: string) => updateDocument(docId, { title }),
    onSuccess: () => { setEditingTitle(false); invalidate() },
  })
  const renameFileMut = useMutation({
    mutationFn: ({ fileId, filename }: { fileId: string; filename: string }) => renameFile(docId, fileId, filename),
    onSuccess: (_, { fileId }) => {
      const existing: string[] = JSON.parse(localStorage.getItem('ltrmgr_manually_renamed') ?? '[]')
      if (!existing.includes(fileId)) {
        localStorage.setItem('ltrmgr_manually_renamed', JSON.stringify([...existing, fileId]))
      }
      setRenamingFileId(null)
      invalidate()
    },
  })
  const statusMut = useMutation({
    mutationFn: (s: ReadStatus) => updateReadStatus(docId, s),
    onSuccess: invalidate,
  })
  const addColMut = useMutation({
    mutationFn: (colId: string) => addToCollection(colId, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['document', docId] })
    },
  })
  const removeColMut = useMutation({
    mutationFn: (colId: string) => removeFromCollection(colId, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['document', docId] })
    },
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf') || f.name.endsWith('.md')
    )
    if (file) uploadMut.mutate(file)
  }

  if (isLoading || !doc) {
    return <div style={{ padding: 40 }}><p className="loading-text">読み込み中...</p></div>
  }

  const c = doc.citation
  const statusCfg = STATUS_CONFIG[doc.read_status as ReadStatus] ?? STATUS_CONFIG.unread
  const typeCfg   = TYPE_HUE[doc.doc_type] ?? TYPE_HUE.academic
  const docCollectionIds = new Set((doc.collections ?? []).map((col) => col.id))

  return (
    <div className="detail-container">
      {/* Header actions */}
      <div className="detail-header-actions">
        <button className="back-btn" onClick={onClose}>← 戻る</button>
        <div className="spacer" />

        <button
          className="status-btn"
          title={`ステータス: ${statusCfg.label}（クリックで変更）`}
          onClick={() => statusMut.mutate(statusCfg.next)}
          style={{
            color: statusCfg.color,
            borderColor: statusCfg.color + '33',
            background: statusCfg.color + '11',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusCfg.color, display: 'inline-block', flexShrink: 0 }} />
          {statusCfg.label}
        </button>

        <div className="dropdown-wrapper">
          <button className="btn btn-ghost" onClick={() => setShowCollections(!showCollections)}>コレクション ▾</button>
          {showCollections && (
            <>
              <div className="dropdown-backdrop" onClick={() => setShowCollections(false)} />
              <div className="detail-dropdown">
                {collections.length === 0 ? (
                  <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-dim)' }}>コレクションがありません</p>
                ) : collections.map((col) => {
                  const inCol = docCollectionIds.has(col.id)
                  return (
                    <button
                      key={col.id}
                      className="detail-col-item"
                      onClick={() => inCol ? removeColMut.mutate(col.id) : addColMut.mutate(col.id)}
                    >
                      <span className="detail-col-check">{inCol ? '✓' : ''}</span>
                      {col.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="dropdown-wrapper">
          <button className="btn btn-ghost" onClick={() => setShowExport(!showExport)}>エクスポート ▾</button>
          {showExport && (
            <>
              <div className="dropdown-backdrop" onClick={() => setShowExport(false)} />
              <div className="dropdown-menu">
                {(['bibtex', 'ris'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    className="dropdown-item"
                    onClick={() => { exportDocuments(fmt, [docId]); setShowExport(false) }}
                  >
                    {fmt === 'bibtex' ? 'BibTeX (.bib)' : 'RIS (.ris)'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="btn btn-ghost" onClick={() => navigate(`/documents/${docId}/edit`)}>編集</button>

        {confirmDelete ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--red)' }}>本当に削除しますか？</span>
            <button className="btn btn-danger" onClick={() => deleteMut.mutate()}>はい、削除</button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>キャンセル</button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>削除</button>
        )}
      </div>

      {dupCheck && dupCheck.duplicates.length > 0 && (
        <div className="warn-banner">⚠ 類似した文献が既に登録されている可能性があります</div>
      )}

      <div className="detail-card">
        <div className="detail-badges">
          <span className="doc-type-badge" style={{ background: typeCfg.bg, color: typeCfg.text }}>
            {TYPE_LABEL[doc.doc_type]}
          </span>
          {doc.tags.map((t) => <TagBadge key={t.id} tag={t} />)}
        </div>

        <h1 className="detail-title" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {editingTitle ? (
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && titleDraft.trim()) updateTitleMut.mutate(titleDraft.trim())
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 'inherit', fontFamily: 'inherit',
                  background: 'var(--surface-alt)', color: 'var(--text)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  disabled={updateTitleMut.isPending || !titleDraft.trim()}
                  onClick={() => updateTitleMut.mutate(titleDraft.trim())}
                  style={{ background: 'var(--accent)', color: '#000', border: 'none' }}
                >
                  {updateTitleMut.isPending ? '保存中...' : '保存'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingTitle(false)}>キャンセル</button>
              </div>
            </span>
          ) : (
            <>
              <span style={{ flex: 1 }}>{doc.title}</span>
              <button
                title="タイトルを編集"
                onClick={() => { setTitleDraft(doc.title); setEditingTitle(true) }}
                style={{
                  flexShrink: 0, marginTop: 4,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', padding: 4, borderRadius: 4,
                }}
              >
                <IconPencil />
              </button>
            </>
          )}
        </h1>

        {c && (
          <div>
            <Row label="著者"      value={c.authors} />
            <Row label="ジャーナル" value={c.journal} />
            <Row label="学会"      value={c.conference} />
            <Row label="巻 / 号"   value={[c.volume, c.issue].filter(Boolean).join(' / ') || null} />
            <Row label="ページ"    value={c.pages} />
            <Row label="出版年"    value={c.year} />
            <Row label="出版社"    value={c.publisher} />
            <Row label="特許番号"  value={c.patent_number} />
            <Row label="特許庁"    value={c.patent_office} />
            {c.doi && (
              <div className="detail-row">
                <span className="detail-row-label">DOI</span>
                <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" className="doi-link">{c.doi}</a>
              </div>
            )}
            {c.url && !c.doi && (
              <div className="detail-row">
                <span className="detail-row-label">URL</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="doi-link">{c.url}</a>
              </div>
            )}
            {c.abstract_text && (
              <div className="detail-abstract">
                <p className="detail-abstract-label">要旨</p>
                <p className="detail-abstract-text">{c.abstract_text}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {doc.citation && (
        <div className="detail-card" style={{ marginBottom: 10 }}>
          <CitationFormatter doc={doc} />
        </div>
      )}

      {uploadResult?.metadata_updated && (
        <div className="ok-banner">
          <span>✓ DOI ({uploadResult.doi_detected}) から書誌情報を自動取得しました</span>
          <button className="banner-close" onClick={() => setUploadResult(null)}>✕</button>
        </div>
      )}

      {/* File section */}
      <div className="detail-card" style={{ marginBottom: 10 }}>
        <div className="section-card-header">
          <span className="section-card-title">ファイル ({doc.pdf_files.length})</span>
        </div>

        {/* Existing files list */}
        {doc.pdf_files.map((pf) => {
          const isMd = pf.filename.endsWith('.md')
          const isPreviewing = previewFileId === pf.id
          const isInlineEditing = inlineEditFileId === pf.id
          const isExpanded = isPreviewing || isInlineEditing
          return (
            <div key={pf.id} style={{ marginBottom: isExpanded ? 8 : 6 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px',
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: isExpanded ? 'var(--r-sm) var(--r-sm) 0 0' : 'var(--r-sm)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                  padding: '2px 6px', borderRadius: 3, flexShrink: 0,
                  background: isMd ? 'rgba(63,176,106,0.15)' : 'rgba(77,141,245,0.15)',
                  color: isMd ? 'var(--green)' : 'var(--blue)',
                }}>
                  {isMd ? 'MD' : 'PDF'}
                </span>
                {renamingFileId === pf.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && renameDraft.trim()) renameFileMut.mutate({ fileId: pf.id, filename: renameDraft.trim() })
                      if (e.key === 'Escape') setRenamingFileId(null)
                    }}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 13, padding: '2px 6px',
                      fontFamily: "'Fira Code', monospace",
                      background: 'var(--surface)', color: 'var(--text)',
                      border: '1px solid var(--accent)', borderRadius: 4, outline: 'none',
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 13, color: 'var(--text)',
                    fontFamily: "'Fira Code', monospace",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {pf.filename}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <FileIconBtn
                    title={renamingFileId === pf.id ? 'リネームを保存' : 'ファイル名を変更'}
                    active={renamingFileId === pf.id}
                    onClick={() => {
                      if (renamingFileId === pf.id) {
                        if (renameDraft.trim()) renameFileMut.mutate({ fileId: pf.id, filename: renameDraft.trim() })
                        else setRenamingFileId(null)
                      } else {
                        setRenameDraft(pf.filename)
                        setRenamingFileId(pf.id)
                      }
                    }}
                  >
                    <IconPencil />
                  </FileIconBtn>
                  <FileIconBtn
                    title={isPreviewing ? 'プレビューを閉じる' : 'プレビュー'}
                    active={isPreviewing}
                    onClick={() => setPreviewFileId(isPreviewing ? null : pf.id)}
                  >
                    <IconEye />
                  </FileIconBtn>
                  <a
                    href={isMd ? `#/documents/${docId}/markdown/${pf.id}` : `#/documents/${docId}/markup/${pf.id}`}
                    target="_blank" rel="noreferrer"
                    title="新しいタブで開く"
                    style={fileIconLinkStyle}
                  >
                    <IconExternalLink />
                  </a>
                  <a
                    href={getPDFDownloadUrl(docId, pf.id)}
                    target="_blank" rel="noreferrer"
                    title="ダウンロード"
                    style={fileIconLinkStyle}
                  >
                    <IconDownload />
                  </a>
                  <FileIconBtn
                    title="削除"
                    danger
                    onClick={() => {
                      if (window.confirm(`「${pf.filename}」を削除しますか？`)) {
                        deleteFileMut.mutate(pf.id)
                      }
                    }}
                  >
                    <IconTrash />
                  </FileIconBtn>
                </div>
              </div>
              {isPreviewing && !isInlineEditing && (
                <div style={{
                  border: '1px solid var(--border)', borderTop: 'none',
                  borderRadius: '0 0 var(--r-sm) var(--r-sm)',
                  overflow: 'hidden',
                }}>
                  {isMd
                    ? <MarkdownViewer docId={docId} fileId={pf.id} />
                    : <PdfMarkupViewer docId={docId} fileId={pf.id} />
                  }
                </div>
              )}
              {isInlineEditing && (
                <div style={{
                  border: '1px solid var(--border)', borderTop: 'none',
                  borderRadius: '0 0 var(--r-sm) var(--r-sm)',
                  padding: 12, background: 'var(--surface)',
                }}>
                  <textarea
                    autoFocus
                    value={inlineEditText}
                    onChange={e => setInlineEditText(e.target.value)}
                    placeholder="Markdown を入力してください..."
                    style={{
                      width: '100%', minHeight: 200, padding: '10px 12px',
                      background: 'var(--surface-alt)', color: 'var(--text)',
                      border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                      fontSize: 13, fontFamily: "'Fira Code', monospace",
                      resize: 'vertical', outline: 'none', lineHeight: 1.6,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm"
                      disabled={inlineSaveMut.isPending}
                      onClick={() => inlineSaveMut.mutate(inlineEditText)}
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                    >
                      {inlineSaveMut.isPending ? '保存中...' : '保存'}
                    </button>
                    <a
                      href={`#/documents/${docId}/markdown/${pf.id}?edit=1`}
                      target="_blank" rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      新しいタブで開く →
                    </a>
                    <button className="btn btn-ghost btn-sm" onClick={() => setInlineEditFileId(null)}>
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Upload zone — always visible to add more files */}
        <div
          className={`pdf-dropzone ${isDragging ? 'pdf-dropzone-drag' : 'pdf-dropzone-normal'}`}
          style={{ marginTop: doc.pdf_files.length > 0 ? 10 : 0 }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,application/pdf,text/markdown,text/x-markdown,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) uploadMut.mutate(e.target.files[0]) }}
          />
          {uploadMut.isPending ? (
            <p className="pdf-dropzone-title" style={{ color: 'var(--accent)' }}>アップロード中...</p>
          ) : (
            <>
              <p className="pdf-dropzone-title" style={{ color: isDragging ? 'var(--accent)' : 'var(--text-muted)' }}>
                {isDragging ? 'ここでドロップ' : 'PDF / Markdown を追加'}
              </p>
              <p className="pdf-dropzone-sub">クリックまたはドラッグ＆ドロップ (.pdf / .md)</p>
            </>
          )}
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={createMdMut.isPending}
            onClick={() => {
              const name = (doc.title || 'new').replace(/[<>:"/\\|?*]/g, '_') + '.md'
              createMdMut.mutate(name)
            }}
          >
            {createMdMut.isPending ? '作成中...' : '新規Markdownを作成'}
          </button>
          {doc.citation?.doi && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => fetchPdfMut.mutate()}
              disabled={fetchPdfMut.isPending}
            >
              {fetchPdfMut.isPending ? '取得中...' : `DOI からPDFを自動取得 (${doc.citation.doi})`}
            </button>
          )}
        </div>

        {fetchPdfMut.isError && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, textAlign: 'center' }}>
            {(fetchPdfMut.error as Error)?.message ?? '取得に失敗しました'}
          </p>
        )}
      </div>

      <div className="detail-card">
        <NoteEditor
          notes={doc.notes}
          onAdd={(content) => createNote(docId, content).then(invalidate)}
          onUpdate={(nid, content) => updateNote(docId, nid, content).then(invalidate)}
          onDelete={(nid) => deleteNote(docId, nid).then(invalidate)}
        />
      </div>
    </div>
  )
}
