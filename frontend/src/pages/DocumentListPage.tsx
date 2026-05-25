import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDocuments, updateDocument, getPDFDownloadUrl, bulkRenameFiles } from '../api/documents'
import { listTags } from '../api/tags'
import { listCollections, createCollection, deleteCollection, addToCollection } from '../api/collections'
import { exportDocuments } from '../api/export'
import { Layout } from '../components/Layout'
import { DocumentCard } from '../components/DocumentCard'
import { DocumentDetailModal } from '../components/DocumentDetailModal'
import { FilterPanel } from '../components/FilterPanel'
import { TagsModal } from '../components/TagsModal'
import type { DocumentSummary, ListDocumentsParams } from '../types'

const DEV_MODE = true

type SortKey = 'default' | 'title_asc' | 'title_desc' | 'year_desc' | 'year_asc' | 'author_asc' | 'author_desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default',     label: '登録順' },
  { value: 'title_asc',   label: 'タイトル (A→Z)' },
  { value: 'title_desc',  label: 'タイトル (Z→A)' },
  { value: 'year_desc',   label: '年 (新しい順)' },
  { value: 'year_asc',    label: '年 (古い順)' },
  { value: 'author_asc',  label: '著者 (A→Z)' },
  { value: 'author_desc', label: '著者 (Z→A)' },
]

function applySorted(docs: DocumentSummary[], sort: SortKey): DocumentSummary[] {
  if (sort === 'default') return docs
  return [...docs].sort((a, b) => {
    switch (sort) {
      case 'title_asc':   return a.title.localeCompare(b.title, 'ja')
      case 'title_desc':  return b.title.localeCompare(a.title, 'ja')
      case 'year_desc':   return (b.citation?.year ?? 0) - (a.citation?.year ?? 0)
      case 'year_asc':    return (a.citation?.year ?? 0) - (b.citation?.year ?? 0)
      case 'author_asc':  return (a.citation?.authors ?? '').localeCompare(b.citation?.authors ?? '', 'ja')
      case 'author_desc': return (b.citation?.authors ?? '').localeCompare(a.citation?.authors ?? '', 'ja')
      default: return 0
    }
  })
}

function formatCitationText(doc: DocumentSummary): string {
  const c = doc.citation
  if (!c) return doc.title
  const parts: string[] = []
  if (c.authors) parts.push(c.authors)
  parts.push(`"${doc.title}"`)
  if (c.journal) parts.push(c.journal)
  if (c.volume) parts.push(`vol. ${c.volume}`)
  if (c.year) parts.push(`(${c.year})`)
  if (c.doi) parts.push(`DOI: ${c.doi}`)
  return parts.join(', ')
}

export function DocumentListPage() {
  const qc = useQueryClient()
  const [params, setParams] = useState<ListDocumentsParams>({ limit: 200 })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('default')
  const [filterOpen, setFilterOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [tagsModalOpen, setTagsModalOpen] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [showNewCol, setShowNewCol] = useState(false)

  // Multi-select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPopup, setBulkPopup] = useState<'collection' | 'tag' | 'export' | null>(null)
  const [bulkWorking, setBulkWorking] = useState(false)

  const effectiveParams: ListDocumentsParams = { ...params, q: search || undefined }

  const { data: rawDocs = [], isFetching } = useQuery({
    queryKey: ['documents', effectiveParams],
    queryFn: () => listDocuments(effectiveParams),
  })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: listCollections })

  const docs = useMemo(() => applySorted(rawDocs, sort), [rawDocs, sort])
  const selectedDocs = useMemo(() => docs.filter(d => selectedIds.has(d.id)), [docs, selectedIds])

  const activeFilterCount = [
    params.doc_type, params.author, params.journal,
    params.year_from, params.year_to, params.read_status,
    ...(params.tag_ids ?? []),
  ].filter(Boolean).length

  const activeCol = collections.find((c) => c.id === params.collection_id)

  const createColMut = useMutation({
    mutationFn: (name: string) => createCollection(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      setNewColName('')
      setShowNewCol(false)
    },
  })

  const deleteColMut = useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      if (params.collection_id === id) setParams((p) => ({ ...p, collection_id: undefined }))
    },
  })

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setParams((p) => ({ ...p, skip: 0 }))
  }, [])

  function handleLongPress(docId: string) {
    setSelectMode(true)
    setSelectedIds(new Set([docId]))
  }

  function handleSelect(docId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setBulkPopup(null)
  }

  async function handleBulkAddToCollection(colId: string) {
    setBulkWorking(true)
    try {
      await Promise.all(selectedDocs.map(d => addToCollection(colId, d.id)))
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['collections'] })
      setBulkPopup(null)
    } finally {
      setBulkWorking(false)
    }
  }

  async function handleBulkToggleTag(tagId: string) {
    setBulkWorking(true)
    try {
      const allHave = selectedDocs.every(d => d.tags.some(t => t.id === tagId))
      await Promise.all(selectedDocs.map(doc => {
        const current = doc.tags.map(t => t.id)
        const next = allHave ? current.filter(id => id !== tagId) : [...current, tagId]
        return updateDocument(doc.id, { tag_ids: next })
      }))
      qc.invalidateQueries({ queryKey: ['documents'] })
      setBulkPopup(null)
    } finally {
      setBulkWorking(false)
    }
  }

  async function handleBulkCopyCitation() {
    const text = selectedDocs.map(formatCitationText).join('\n\n')
    await navigator.clipboard.writeText(text)
    exitSelectMode()
  }

  function handleBulkDownload() {
    selectedDocs.forEach(d => {
      d.pdf_files.forEach(pf => {
        const a = document.createElement('a')
        a.href = getPDFDownloadUrl(d.id, pf.id)
        a.download = pf.filename
        a.click()
      })
    })
    exitSelectMode()
  }

  function handleBulkExport(fmt: 'bibtex' | 'ris') {
    exportDocuments(fmt, Array.from(selectedIds))
    setBulkPopup(null)
    exitSelectMode()
  }

  async function handleBulkRename() {
    setBulkWorking(true)
    try {
      const skipFileIds: string[] = JSON.parse(localStorage.getItem('ltrmgr_manually_renamed') ?? '[]')
      await bulkRenameFiles(Array.from(selectedIds), skipFileIds)
      qc.invalidateQueries({ queryKey: ['documents'] })
      exitSelectMode()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'リネームに失敗しました')
    } finally {
      setBulkWorking(false)
    }
  }

  return (
  <>
    <Layout>
      <div className="doc-list-main">
        <div className="doc-list-inner">

          {/* Search + Sort + Collections + Filter — single row */}
          <div className="search-bar-row">
            <input
              type="search"
              className="search-input"
              placeholder="タイトル・著者・DOIを検索（* ? 対応）"
              value={search}
              onChange={handleSearch}
            />
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button
              className={`filter-toggle-btn${colOpen ? ' active' : ''}${activeCol ? ' has-value' : ''}`}
              onClick={() => { setColOpen((o) => !o); setFilterOpen(false) }}
            >
              {colOpen ? '▲' : '▼'} コレクション
              {activeCol && <span className="filter-badge">1</span>}
            </button>

            <button
              className={`filter-toggle-btn${filterOpen ? ' active' : ''}`}
              onClick={() => { setFilterOpen((o) => !o); setColOpen(false) }}
            >
              {filterOpen ? '▲' : '▼'} 絞り込み
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* Collections accordion */}
          {colOpen && (
            <div className="filter-panel-content col-panel">
              <div className="col-panel-list">
                <button
                  className={`col-panel-item${!params.collection_id ? ' active' : ''}`}
                  onClick={() => setParams((p) => ({ ...p, collection_id: undefined, skip: 0 }))}
                >
                  すべての文献
                  {!params.collection_id && <span className="col-panel-check">✓</span>}
                </button>

                {collections.map((col) => (
                  <div key={col.id} className="col-panel-row">
                    <button
                      className={`col-panel-item${params.collection_id === col.id ? ' active' : ''}`}
                      onClick={() => setParams((p) => ({ ...p, collection_id: col.id, skip: 0 }))}
                    >
                      <span>{col.name}</span>
                      <span className="col-panel-count">{col.document_count}</span>
                      {params.collection_id === col.id && <span className="col-panel-check">✓</span>}
                    </button>
                    <button
                      className="col-panel-delete"
                      onClick={() => {
                        if (window.confirm(`「${col.name}」を削除しますか？`)) deleteColMut.mutate(col.id)
                      }}
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {showNewCol ? (
                  <div className="col-new-form">
                    <input
                      autoFocus
                      className="col-new-input"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newColName.trim()) createColMut.mutate(newColName.trim())
                        if (e.key === 'Escape') { setShowNewCol(false); setNewColName('') }
                      }}
                      placeholder="コレクション名"
                    />
                    <div className="col-new-actions">
                      <button
                        className="col-confirm-btn"
                        onClick={() => { if (newColName.trim()) createColMut.mutate(newColName.trim()) }}
                      >
                        作成
                      </button>
                      <button
                        className="col-cancel-btn"
                        onClick={() => { setShowNewCol(false); setNewColName('') }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="col-add-btn col-panel-add" onClick={() => setShowNewCol(true)}>
                    ＋ 新規コレクション
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter accordion */}
          <FilterPanel
            tags={tags}
            params={params}
            onChange={setParams}
            open={filterOpen}
            onOpenTagsManager={() => setTagsModalOpen(true)}
          />

          {/* Personal mode badge + document count */}
          {(!isFetching && docs.length > 0) || DEV_MODE ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {DEV_MODE && <span className="personal-mode-chip">Personal mode</span>}
              {!isFetching && docs.length > 0 && (
                <p className="doc-count-line" style={{ marginBottom: 0 }}>
                  {activeCol ? `${activeCol.name} · ` : ''}{docs.length} 件
                </p>
              )}
            </div>
          ) : null}

          {/* List */}
          {isFetching && <p className="loading-text">読み込み中...</p>}

          {docs.length === 0 && !isFetching ? (
            <div className="empty-state">
              <div className="empty-state-glyph">◈</div>
              <p className="empty-state-title">文献が見つかりません</p>
              <p className="empty-state-sub">右下の ＋ ボタンから登録してください</p>
            </div>
          ) : (
            <div className="doc-list" style={selectMode ? { paddingBottom: 72 } : undefined}>
              {docs.map((doc, i) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  index={i}
                  onOpen={setSelectedDocId}
                  selectMode={selectMode}
                  selected={selectedIds.has(doc.id)}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>

    {selectedDocId && !selectMode && (
      <DocumentDetailModal docId={selectedDocId} onClose={() => setSelectedDocId(null)} />
    )}

    {tagsModalOpen && (
      <TagsModal onClose={() => setTagsModalOpen(false)} />
    )}

    {/* Bulk action bar */}
    {selectMode && (
      <div className="bulk-bar">
        {bulkPopup === 'collection' && (
          <div className="bulk-popup">
            {collections.length === 0
              ? <p className="bulk-popup-empty">コレクションがありません</p>
              : collections.map(col => (
                <button key={col.id} className="bulk-popup-item" disabled={bulkWorking} onClick={() => handleBulkAddToCollection(col.id)}>
                  {col.name}
                </button>
              ))
            }
          </div>
        )}
        {bulkPopup === 'tag' && (
          <div className="bulk-popup">
            {tags.length === 0
              ? <p className="bulk-popup-empty">タグがありません</p>
              : tags.map(tag => {
                const allHave = selectedDocs.every(d => d.tags.some(t => t.id === tag.id))
                return (
                  <button key={tag.id} className="bulk-popup-item" disabled={bulkWorking} onClick={() => handleBulkToggleTag(tag.id)}>
                    <span style={{ color: tag.color, marginRight: 6 }}>●</span>
                    {tag.name}
                    {allHave && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>✓</span>}
                  </button>
                )
              })
            }
          </div>
        )}
        {bulkPopup === 'export' && (
          <div className="bulk-popup">
            <button className="bulk-popup-item" onClick={() => handleBulkExport('bibtex')}>BibTeX (.bib)</button>
            <button className="bulk-popup-item" onClick={() => handleBulkExport('ris')}>RIS (.ris)</button>
          </div>
        )}
        <div className="bulk-bar-inner">
          <span className="bulk-bar-count">{selectedIds.size}件選択中</span>
          <button
            className={`bulk-bar-btn${bulkPopup === 'collection' ? ' active' : ''}`}
            onClick={() => setBulkPopup(p => p === 'collection' ? null : 'collection')}
          >
            コレクション
          </button>
          <button
            className={`bulk-bar-btn${bulkPopup === 'tag' ? ' active' : ''}`}
            onClick={() => setBulkPopup(p => p === 'tag' ? null : 'tag')}
          >
            タグ
          </button>
          <button className="bulk-bar-btn" disabled={selectedDocs.length === 0} onClick={handleBulkCopyCitation}>
            引用をコピー
          </button>
          <button className="bulk-bar-btn" disabled={selectedDocs.length === 0} onClick={handleBulkDownload}>
            ダウンロード
          </button>
          <button
            className={`bulk-bar-btn${bulkPopup === 'export' ? ' active' : ''}`}
            onClick={() => setBulkPopup(p => p === 'export' ? null : 'export')}
          >
            エクスポート
          </button>
          <button className="bulk-bar-btn" disabled={bulkWorking || selectedDocs.length === 0} onClick={handleBulkRename}>
            {bulkWorking ? '処理中...' : 'リネーム'}
          </button>
          <button className="bulk-bar-btn bulk-bar-btn--close" onClick={exitSelectMode}>×</button>
        </div>
      </div>
    )}
  </>
  )
}
