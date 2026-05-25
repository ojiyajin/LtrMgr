import { client } from './client'
import type { Note } from '../types'

export async function createNote(docId: string, content: string): Promise<Note> {
  const { data } = await client.post<Note>(`/documents/${docId}/notes`, { content })
  return data
}

export async function updateNote(docId: string, noteId: string, content: string): Promise<Note> {
  const { data } = await client.patch<Note>(`/documents/${docId}/notes/${noteId}`, { content })
  return data
}

export async function deleteNote(docId: string, noteId: string): Promise<void> {
  await client.delete(`/documents/${docId}/notes/${noteId}`)
}
