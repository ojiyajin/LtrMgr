import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTags, createTag, updateTag, deleteTag } from '../api/tags'
import type { Tag } from '../types'

const PRESET_COLORS = ['#6366f1', '#f59e0b', '#3fb06a', '#e05454', '#4d8df5', '#a855f7', '#ec4899', '#14b8a6']

const fieldStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  outline: 'none',
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  fontFamily: 'inherit',
}

function ColorDots({ selected, onSelect, size = 18 }: { selected: string; onSelect: (c: string) => void; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
            transition: 'transform 0.1s',
            transform: selected === c ? 'scale(1.18)' : 'scale(1)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

export function TagsModal({ onClose }: { onClose: () => void }) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box tags-modal-box" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="modal-title" style={{ marginBottom: 0, flex: 1 }}>タグ管理</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* New tag form */}
        <div style={{ marginBottom: 16, padding: '14px 16px', background: 'var(--surface-alt)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            新しいタグ
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              style={{ ...fieldStyle, flex: 1, minWidth: 120 }}
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
        {tags.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            タグがまだありません
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {tags.map((tag) =>
            editId === tag.id ? (
              <div key={tag.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <input
                  style={{ ...fieldStyle, flex: 1, minWidth: 120 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <ColorDots selected={editColor} onSelect={setEditColor} size={16} />
                <button className="btn btn-primary btn-sm" onClick={() => updMut.mutate({ id: tag.id, name: editName, color: editColor })}>保存</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>キャンセル</button>
              </div>
            ) : (
              <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: tag.color, flexShrink: 0, boxShadow: `0 0 6px ${tag.color}88` }} />
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)' }}>{tag.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(tag)}>編集</button>
                <button className="btn btn-danger btn-sm" onClick={() => delMut.mutate(tag.id)}>削除</button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
