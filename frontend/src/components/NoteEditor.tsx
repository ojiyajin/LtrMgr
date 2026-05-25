import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Note } from '../types'

interface Props {
  notes: Note[]
  onAdd: (content: string) => Promise<void>
  onUpdate: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const btn = (variant: 'primary' | 'ghost' | 'danger'): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500,
  border: variant === 'primary' ? 'none' : '1px solid',
  background: variant === 'primary' ? '#6366f1' : variant === 'danger' ? 'transparent' : 'transparent',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#f87171' : '#94a3b8',
  borderColor: variant === 'ghost' ? '#2c303a' : variant === 'danger' ? '#7f1d1d' : undefined,
})

const textareaStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px',
  background: '#111318', color: '#e2e6ef',
  border: '1px solid #2c303a', borderRadius: 8,
  fontSize: 14, resize: 'vertical', fontFamily: 'inherit', minHeight: 80,
}

export function NoteEditor({ notes, onAdd, onUpdate, onDelete }: Props) {
  const [newText, setNewText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!newText.trim()) return
    setSaving(true)
    try {
      await onAdd(newText.trim())
      setNewText('')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string) {
    if (!editText.trim()) return
    setSaving(true)
    try {
      await onUpdate(id, editText.trim())
      setEditId(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e2e6ef' }}>メモ</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <textarea
          value={newText} onChange={(e) => setNewText(e.target.value)}
          placeholder="メモを追加... (Markdown使用可)"
          rows={4}
          style={textareaStyle}
        />
        <button style={btn('primary')} onClick={handleAdd} disabled={saving}>追加</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notes.map((note) => (
          <div key={note.id} style={{ background: '#252930', border: '1px solid #2c303a', borderRadius: 8, padding: '12px 14px' }}>
            {editId === note.id ? (
              <div>
                <textarea
                  value={editText} onChange={(e) => setEditText(e.target.value)}
                  rows={6}
                  style={{ ...textareaStyle, flex: 'unset', width: '100%', minHeight: 120, border: '1px solid #6366f1' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={btn('primary')} onClick={() => handleUpdate(note.id)} disabled={saving}>保存</button>
                  <button style={btn('ghost')} onClick={() => setEditId(null)}>キャンセル</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: '#e2e6ef' }} className="markdown-viewer">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={btn('ghost')} onClick={() => { setEditId(note.id); setEditText(note.content) }}>編集</button>
                  <button style={btn('danger')} onClick={() => onDelete(note.id)}>削除</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
