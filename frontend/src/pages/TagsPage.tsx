import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTags, createTag, updateTag, deleteTag } from '../api/tags'
import { Layout } from '../components/Layout'
import type { Tag } from '../types'

const PRESET_COLORS = ['#6366f1', '#f59e0b', '#3fb06a', '#e05454', '#4d8df5', '#a855f7', '#ec4899', '#14b8a6']

const fieldStyle: React.CSSProperties = {
  padding: '8px 11px',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  outline: 'none',
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  fontFamily: 'inherit',
}

export function TagsPage() {
  const qc = useQueryClient()
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags })
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tags'] })

  const addMut = useMutation({
    mutationFn: () => createTag(name, color),
    onSuccess: () => { invalidate(); setName('') },
  })
  const updMut = useMutation({
    mutationFn: (t: Tag) => updateTag(t.id, t.name, t.color),
    onSuccess: () => { invalidate(); setEditId(null) },
  })
  const delMut = useMutation({ mutationFn: deleteTag, onSuccess: invalidate })

  function startEdit(tag: Tag) {
    setEditId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  function ColorDots({ selected, onSelect, size = 20 }: { selected: string; onSelect: (c: string) => void; size?: number }) {
    return (
      <div style={{ display: 'flex', gap: 5 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            title={c}
            style={{
              width: size, height: size,
              borderRadius: '50%',
              background: c,
              border: selected === c ? `2px solid var(--text)` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'transform 0.1s, border-color 0.1s',
              transform: selected === c ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <Layout>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '32px 28px' }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            marginBottom: 24,
          }}>
            タグ管理
          </h1>

          {/* New tag form */}
          <div className="detail-card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
              新しいタグを作成
            </h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
                placeholder="タグ名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && addMut.mutate()}
              />
              <ColorDots selected={color} onSelect={setColor} />
              <button
                className="btn btn-primary btn-sm"
                disabled={!name.trim() || addMut.isPending}
                onClick={() => addMut.mutate()}
              >
                追加
              </button>
            </div>
          </div>

          {/* Tag list */}
          <div className="detail-card">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
              タグ一覧
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>
                {tags.length} 件
              </span>
            </h2>

            {tags.length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                タグがまだありません
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tags.map((tag) =>
                editId === tag.id ? (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      style={{ ...fieldStyle, flex: 1, minWidth: 140 }}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <ColorDots selected={editColor} onSelect={setEditColor} size={18} />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => updMut.mutate({ id: tag.id, name: editName, color: editColor })}
                    >
                      保存
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: tag.color,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${tag.color}88`,
                    }} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{tag.name}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(tag)}>
                      編集
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => delMut.mutate(tag.id)}>
                      削除
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
