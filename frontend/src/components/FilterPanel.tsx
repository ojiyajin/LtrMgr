import type { DocumentType, Tag, ListDocumentsParams, ReadStatus } from '../types'

interface Props {
  tags: Tag[]
  params: ListDocumentsParams
  onChange: (p: ListDocumentsParams) => void
  open: boolean
  onOpenTagsManager?: () => void
}

export function FilterPanel({ tags, params, onChange, open, onOpenTagsManager }: Props) {
  const set = (key: keyof ListDocumentsParams, value: unknown) =>
    onChange({ ...params, [key]: value || undefined, skip: 0 })

  const toggleTag = (id: string) => {
    const ids = params.tag_ids ?? []
    onChange({
      ...params,
      tag_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      skip: 0,
    })
  }

  if (!open) return null

  return (
    <div className="filter-panel-content">
      <div className="filter-grid">
        <div className="filter-field">
          <label className="filter-label">文献種別</label>
          <select
            className="filter-select"
            value={params.doc_type ?? ''}
            onChange={(e) => set('doc_type', e.target.value as DocumentType)}
          >
            <option value="">すべて</option>
            <option value="academic">学術文献</option>
            <option value="patent">特許</option>
            <option value="abstract">学会要旨</option>
            <option value="textbook">学習用テキスト</option>
          </select>
        </div>

        <div className="filter-field">
          <label className="filter-label">既読ステータス</label>
          <select
            className="filter-select"
            value={params.read_status ?? ''}
            onChange={(e) => set('read_status', e.target.value as ReadStatus)}
          >
            <option value="">すべて</option>
            <option value="unread">未読</option>
            <option value="reading">読書中</option>
            <option value="read">読了</option>
          </select>
        </div>

        <div className="filter-field">
          <label className="filter-label">著者</label>
          <input
            className="filter-input"
            placeholder="著者名"
            value={params.author ?? ''}
            onChange={(e) => set('author', e.target.value)}
          />
        </div>

        <div className="filter-field">
          <label className="filter-label">ジャーナル / 学会</label>
          <input
            className="filter-input"
            placeholder="ジャーナル名"
            value={params.journal ?? ''}
            onChange={(e) => set('journal', e.target.value)}
          />
        </div>

        <div className="filter-field">
          <label className="filter-label">出版年 (from)</label>
          <input
            className="filter-input"
            type="number"
            placeholder="例: 2020"
            value={params.year_from ?? ''}
            onChange={(e) => set('year_from', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        <div className="filter-field">
          <label className="filter-label">出版年 (to)</label>
          <input
            className="filter-input"
            type="number"
            placeholder="例: 2024"
            value={params.year_to ?? ''}
            onChange={(e) => set('year_to', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        <div className="filter-field filter-tags-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <label className="filter-label" style={{ marginBottom: 0 }}>タグ</label>
            {onOpenTagsManager && (
              <button
                className="tag-gear-btn"
                onClick={onOpenTagsManager}
                title="タグ管理"
              >
                ⚙
              </button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="filter-tags">
              {tags.map((t) => {
                const active = params.tag_ids?.includes(t.id)
                return (
                  <button
                    key={t.id}
                    className="filter-tag-btn"
                    onClick={() => toggleTag(t.id)}
                    style={{
                      border: `1px solid ${t.color}55`,
                      background: active ? t.color + 'cc' : 'transparent',
                      color: active ? '#fff' : t.color,
                    }}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
