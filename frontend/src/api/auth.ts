import { client } from './client'

export type AuthMode = 'personal' | 'team' | 'secure'

export interface LoginPayload { username: string; password: string }
export interface RegisterPayload { username: string; password: string }
export interface UserOut { id: string; username: string | null; email: string; created_at: string }

export async function getAuthMode(): Promise<AuthMode> {
  const { data } = await client.get<{ mode: AuthMode }>('/auth/mode')
  return data.mode
}

export async function teamJoin(username: string): Promise<string> {
  const { data } = await client.post<{ access_token: string }>('/auth/join', { username })
  return data.access_token
}

export async function login(p: LoginPayload): Promise<string> {
  const form = new URLSearchParams({ username: p.username, password: p.password })
  const { data } = await client.post<{ access_token: string }>('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data.access_token
}

export async function register(p: RegisterPayload): Promise<UserOut> {
  const { data } = await client.post<UserOut>('/auth/register', p)
  return data
}

export async function getMe(): Promise<UserOut> {
  const { data } = await client.get<UserOut>('/auth/me')
  return data
}
