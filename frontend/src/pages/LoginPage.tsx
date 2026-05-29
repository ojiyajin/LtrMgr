import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAuthMode, teamJoin, login, register } from '../api/auth'
import { useAuthStore } from '../store/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)

  const { data: mode } = useQuery({
    queryKey: ['authMode'],
    queryFn: getAuthMode,
    staleTime: Infinity,
  })

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [view, setView] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Personal mode needs no login — redirect immediately once mode is known.
  useEffect(() => {
    if (mode === 'personal') navigate('/documents', { replace: true })
  }, [mode, navigate])

  if (!mode || mode === 'personal') return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let token: string
      if (mode === 'team') {
        token = await teamJoin(username)
      } else {
        // secure
        if (view === 'register') await register({ username, password })
        token = await login({ username, password })
      }
      setToken(token)
      navigate('/documents')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const isTeam = mode === 'team'
  const isRegister = !isTeam && view === 'register'

  const modeLabel = isTeam
    ? 'Team — ユーザー名で入室'
    : view === 'register' ? 'Secure — アカウント作成' : 'Secure — ログイン'

  const submitLabel = isTeam ? '入室' : isRegister ? 'アカウント作成' : 'ログイン'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 380,
        background: 'var(--surface)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--r-lg)',
        padding: '44px 40px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}>
            Ltr<span style={{ color: 'var(--accent)' }}>Mgr</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {modeLabel}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--red-dim)',
            color: 'var(--red)',
            border: '1px solid rgba(224,84,84,0.25)',
            borderRadius: 'var(--r-sm)',
            padding: '10px 14px',
            marginBottom: 18,
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Username field */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>ユーザー名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              style={inputStyle}
            />
          </div>

          {/* Password field — Secure mode only */}
          {!isTeam && (
            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                style={inputStyle}
              />
            </div>
          )}

          {isTeam && <div style={{ marginBottom: 28 }} />}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px', fontSize: 14, justifyContent: 'center' }}
          >
            {loading ? '処理中...' : submitLabel}
          </button>
        </form>

        {/* Secure: toggle between login / register */}
        {!isTeam && (
          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-dim)' }}>
            {view === 'login' ? (
              <>
                アカウントをお持ちでない方は{' '}
                <button onClick={() => { setView('register'); setError('') }} style={linkBtnStyle}>
                  新規登録
                </button>
              </>
            ) : (
              <>
                すでにアカウントをお持ちの方は{' '}
                <button onClick={() => { setView('login'); setError('') }} style={linkBtnStyle}>
                  ログイン
                </button>
              </>
            )}
          </p>
        )}

        {/* Team: hint */}
        {isTeam && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
            初回入室時にアカウントが自動作成されます
          </p>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-dim)',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  marginBottom: 7,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--r-sm)',
  fontSize: 14,
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent)',
  cursor: 'pointer',
  fontSize: 'inherit',
  textDecoration: 'underline',
}
