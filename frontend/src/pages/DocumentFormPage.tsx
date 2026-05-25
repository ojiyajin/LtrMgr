import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createDocument, getDocument, updateDocument, lookupDOI, uploadPDF } from '../api/documents'
import { listTags, createTag } from '../api/tags'
import { Layout } from '../components/Layout'
import { TagBadge } from '../components/TagBadge'
import { useConferenceMode } from '../store/conferenceMode'
import type { DocumentType, DocumentCreate, DocumentUpdate, Tag } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  transition: 'border-color 0.14s',
}

const lblStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-dim)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '20px 24px',
  marginBottom: 12,
}

type CitationForm = {
  authors: string; journal: string; volume: string; issue: string; pages: string;
  year: string; doi: string; url: string; publisher: string;
  patent_number: string; patent_office: string; conference: string;
  abstract_text: string;
}

const emptyCit = (): CitationForm => ({
  authors: '', journal: '', volume: '', issue: '', pages: '',
  year: '', doi: '', url: '', publisher: '',
  patent_number: '', patent_office: '', conference: '',
  abstract_text: '',
})

export function DocumentFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(id!),
    enabled: isEdit,
  })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags })
  const cm = useConferenceMode()

  const [docType, setDocType] = useState<DocumentType>(!isEdit && cm.active ? 'abstract' : 'academic')
  const [title, setTitle] = useState('')
  const [cit, setCit] = useState<CitationForm>(
    !isEdit && cm.active
      ? { ...emptyCit(), conference: cm.name, year: String(cm.year) }
      : emptyCit()
  )
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [doiInput, setDoiInput] = useState('')
  const [doiLoading, setDoiLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfDragging, setPdfDragging] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!existing) return
    setDocType(existing.doc_type)
    setTitle(existing.title)
    setSelectedTags(existing.tags)
    if (existing.citation) {
      const c = existing.citation
      setCit({
        authors: c.authors ?? '', journal: c.journal ?? '', volume: c.volume ?? '',
        issue: c.issue ?? '', pages: c.pages ?? '', year: c.year ? String(c.year) : '',
        doi: c.doi ?? '', url: c.url ?? '', publisher: c.publisher ?? '',
        patent_number: c.patent_number ?? '', patent_office: c.patent_office ?? '',
        conference: c.conference ?? '', abstract_text: c.abstract_text ?? '',
      })
    }
  }, [existing])

  async function handleDOILookup() {
    if (!doiInput.trim()) return
    setDoiLoading(true)
    setError('')
    try {
      const result = await lookupDOI(doiInput.trim())
      setTitle(result.title)
      const c = result.citation
      setCit((prev) => ({
        ...prev,
        authors: c.authors ?? prev.authors,
        journal: c.journal ?? prev.journal,
        conference: c.conference ?? prev.conference,
        volume: c.volume ?? prev.volume,
        issue: c.issue ?? prev.issue,
        pages: c.pages ?? prev.pages,
        year: c.year ? String(c.year) : prev.year,
        doi: c.doi ?? doiInput.trim(),
        url: c.url ?? prev.url,
        publisher: c.publisher ?? prev.publisher,
        abstract_text: c.abstract_text ?? prev.abstract_text,
      }))
    } catch {
      setError('DOI / arXiv IDが見つかりませんでした')
    } finally {
      setDoiLoading(false)
    }
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const citPayload = {
        authors: cit.authors || undefined, journal: cit.journal || undefined,
        volume: cit.volume || undefined, issue: cit.issue || undefined,
        pages: cit.pages || undefined, year: cit.year ? Number(cit.year) : undefined,
        doi: cit.doi || undefined, url: cit.url || undefined, publisher: cit.publisher || undefined,
        patent_number: cit.patent_number || undefined, patent_office: cit.patent_office || undefined,
        conference: cit.conference || undefined, abstract_text: cit.abstract_text || undefined,
      }

      let tagIds = selectedTags.map((t) => t.id)
      if (cm.active && !isEdit) {
        const confTagName = cm.tagName
        const found = allTags.find((t) => t.name === confTagName)
        const confTag = found ?? await createTag(confTagName, '#8b5cf6')
        if (!tagIds.includes(confTag.id)) tagIds = [...tagIds, confTag.id]
      }

      let doc
      if (isEdit) {
        const body: DocumentUpdate = { title, doc_type: docType, citation: citPayload, tag_ids: tagIds }
        doc = await updateDocument(id!, body)
      } else {
        const body: DocumentCreate = { doc_type: docType, title, citation: citPayload, tag_ids: tagIds }
        doc = await createDocument(body)
      }
      if (pdfFile) await uploadPDF(doc.id, pdfFile)
      return doc
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      navigate(`/documents/${doc.id}`)
    },
    onError: () => setError('保存に失敗しました'),
  })

  const toggleTag = (tag: Tag) =>
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]
    )
  const unselectedTags = allTags.filter((t) => !selectedTags.some((s) => s.id === t.id))

  function citField(key: keyof CitationForm, placeholder: string, label: string) {
    return (
      <div>
        <span style={lblStyle}>{label}</span>
        <input
          style={inputStyle}
          placeholder={placeholder}
          value={cit[key]}
          onChange={(e) => setCit((p) => ({ ...p, [key]: e.target.value }))}
        />
      </div>
    )
  }

  return (
    <Layout>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 28px' }}>
          {/* Page header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
            }}>
              {isEdit ? '文献を編集' : '文献を追加'}
            </h1>
            <button className="back-btn" onClick={() => navigate(-1)}>← 戻る</button>
          </div>

          {/* Conference mode notice */}
          {cm.active && !isEdit && (
            <div style={{
              background: 'rgba(139,92,246,0.10)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              color: '#c4b5fd',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontWeight: 700 }}>● 学会参加モード</span>
              <span>登録すると <strong>{cm.tagName}</strong> タグが自動付与されます</span>
            </div>
          )}

          {error && (
            <div style={{
              background: 'var(--red-dim)',
              color: 'var(--red)',
              border: '1px solid rgba(224,84,84,0.25)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Basic info */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>基本情報</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <span style={lblStyle}>文献種別</span>
                <select
                  style={inputStyle}
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocumentType)}
                >
                  <option value="academic">学術文献</option>
                  <option value="patent">特許</option>
                  <option value="abstract">学会要旨</option>
                  <option value="textbook">学習用テキスト</option>
                </select>
              </div>
              <div>
                <span style={lblStyle}>タイトル *</span>
                <input
                  style={inputStyle}
                  placeholder="文献タイトル"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* DOI lookup */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
              DOI / arXiv から自動取得
            </h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="DOI (例: 10.1038/s41586-...) または arXiv ID (例: 2301.00001)"
                value={doiInput}
                onChange={(e) => setDoiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDOILookup()}
              />
              <button
                className="btn btn-blue"
                onClick={handleDOILookup}
                disabled={doiLoading}
              >
                {doiLoading ? '取得中...' : '取得'}
              </button>
            </div>
          </div>

          {/* Citation info */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>引用情報</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {citField('authors', '例: Smith, J., Tanaka, K.', '著者')}
              {citField('year', '例: 2023', '出版年')}
              {docType === 'patent' ? (
                <>
                  {citField('patent_number', '例: US10123456B2', '特許番号')}
                  {citField('patent_office', '例: USPTO', '特許庁')}
                </>
              ) : docType === 'abstract' ? (
                <>
                  {citField('conference', '例: 第XXX回日本化学会', '学会名')}
                  {citField('pages', '例: P-123', '演題番号 / ページ')}
                </>
              ) : (
                <>
                  {citField('journal', '例: Nature', 'ジャーナル')}
                  {citField('volume', '例: 42', '巻')}
                  {citField('issue', '例: 3', '号')}
                  {citField('pages', '例: 123-130', 'ページ')}
                </>
              )}
              {citField('publisher', '例: Springer', '出版社')}
              {citField('doi', '例: 10.1000/xyz123', 'DOI')}
              <div style={{ gridColumn: '1/-1' }}>{citField('url', 'https://...', 'URL')}</div>
            </div>
          </div>

          {/* Abstract */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>要旨</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
              DOI / arXiv 取得時に自動入力されます。手動で入力・編集も可能です。
            </p>
            <textarea
              value={cit.abstract_text}
              onChange={(e) => setCit((p) => ({ ...p, abstract_text: e.target.value }))}
              placeholder="論文・要旨の内容をここに入力してください..."
              rows={8}
              style={{
                ...inputStyle,
                resize: 'vertical',
                lineHeight: 1.75,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tags */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>タグ</h2>
            {selectedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {selectedTags.map((t) => (
                  <TagBadge key={t.id} tag={t} onRemove={() => toggleTag(t)} />
                ))}
              </div>
            )}
            {unselectedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {unselectedTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t)}
                    style={{
                      border: `1px solid ${t.color}44`,
                      background: 'transparent',
                      color: t.color,
                      borderRadius: 999,
                      padding: '3px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.14s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.color + '20' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    + {t.name}
                  </button>
                ))}
              </div>
            )}
            {allTags.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                タグがありません。「タグ管理」から作成できます。
              </p>
            )}
          </div>

          {/* File (PDF / MD) */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>PDF / Markdown（任意）</h2>
            {pdfFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>
                  📄 {pdfFile.name}
                  {pdfFile.size === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>（空・保存後に編集可）</span>
                  )}
                </span>
                <button
                  onClick={() => setPdfFile(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕ 解除
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`pdf-dropzone ${pdfDragging ? 'pdf-dropzone-drag' : 'pdf-dropzone-normal'}`}
                  onDragOver={(e) => { e.preventDefault(); setPdfDragging(true) }}
                  onDragLeave={() => setPdfDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setPdfDragging(false)
                    const file = Array.from(e.dataTransfer.files).find(
                      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf') || f.name.endsWith('.md')
                    )
                    if (file) setPdfFile(file)
                  }}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,.md,application/pdf,text/markdown,text/x-markdown,text/plain"
                    style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files?.[0]) setPdfFile(e.target.files[0]) }}
                  />
                  <p className="pdf-dropzone-title" style={{ color: pdfDragging ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {pdfDragging ? 'ここでドロップ' : 'PDF / Markdown をドラッグ＆ドロップ'}
                  </p>
                  <p className="pdf-dropzone-sub">またはクリックしてファイルを選択 (.pdf / .md)</p>
                </div>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const name = (title.trim() || 'new').replace(/[<>:"/\\|?*]/g, '_') + '.md'
                      setPdfFile(new File([''], name, { type: 'text/markdown' }))
                    }}
                  >
                    新規Markdownを作成
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              キャンセル
            </button>
            <button
              className="btn btn-primary"
              onClick={() => saveMut.mutate()}
              disabled={!title.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
