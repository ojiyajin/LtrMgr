import { client } from './client'
import type { Tag } from '../types'

export async function listTags(): Promise<Tag[]> {
  const { data } = await client.get<Tag[]>('/tags')
  return data
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const { data } = await client.post<Tag>('/tags', { name, color })
  return data
}

export async function updateTag(id: string, name?: string, color?: string): Promise<Tag> {
  const { data } = await client.patch<Tag>(`/tags/${id}`, { name, color })
  return data
}

export async function deleteTag(id: string): Promise<void> {
  await client.delete(`/tags/${id}`)
}
