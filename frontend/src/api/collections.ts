import { client } from './client'
import type { Collection } from '../types'

export async function listCollections(): Promise<Collection[]> {
  const { data } = await client.get<Collection[]>('/collections')
  return data
}

export async function createCollection(name: string): Promise<Collection> {
  const { data } = await client.post<Collection>('/collections', { name })
  return data
}

export async function updateCollection(id: string, name: string): Promise<Collection> {
  const { data } = await client.patch<Collection>(`/collections/${id}`, { name })
  return data
}

export async function deleteCollection(id: string): Promise<void> {
  await client.delete(`/collections/${id}`)
}

export async function addToCollection(colId: string, docId: string): Promise<void> {
  await client.post(`/collections/${colId}/documents/${docId}`)
}

export async function removeFromCollection(colId: string, docId: string): Promise<void> {
  await client.delete(`/collections/${colId}/documents/${docId}`)
}
