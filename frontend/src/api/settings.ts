import { client } from './client'
import type { AppSettings } from '../types'

export async function getSettings(): Promise<AppSettings> {
  const { data } = await client.get<AppSettings>('/settings')
  return data
}

export async function saveSettings(body: AppSettings): Promise<AppSettings> {
  const { data } = await client.put<AppSettings>('/settings', body)
  return data
}
