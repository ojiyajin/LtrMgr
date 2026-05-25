import { useQueryClient } from '@tanstack/react-query'
import type { Note } from '../types'
import { createNote, updateNote, deleteNote } from '../api/notes'
import { NoteEditor } from './NoteEditor'

interface Props {
  show: boolean
  docId: string
  notes: Note[]
}

export function NotesPanel({ show, docId, notes }: Props) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['document', docId] })

  if (!show) return null

  return (
    <div style={{
      flexShrink: 0, background: '#1c1f26', borderTop: '2px solid #334155',
      maxHeight: '55vh', overflowY: 'auto', padding: '16px 20px',
    }}>
      <NoteEditor
        notes={notes}
        onAdd={(content) => createNote(docId, content).then(invalidate)}
        onUpdate={(nid, content) => updateNote(docId, nid, content).then(invalidate)}
        onDelete={(nid) => deleteNote(docId, nid).then(invalidate)}
      />
    </div>
  )
}
