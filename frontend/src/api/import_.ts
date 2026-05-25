import { client } from './client'
import type { ImportResult } from '../types'

export async function importReferences(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post<ImportResult>('/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
