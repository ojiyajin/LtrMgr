import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../api/auth'
import { useAuthStore } from '../store/auth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setToken = useAuthStore((s) => s.setToken)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = await login({ username: email, password })
      setToken(token)
      navigate('/documents')
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません')
    } finally {
      setLoading(false)
    }
  }

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
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}>
            Ltr<span style={{ color: 'var(--accent)' }}>Mgr</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            文献管理システム
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
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              marginBottom: 7,
            }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 13px',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--r-sm)',
                fontSize: 14,
                background: 'var(--surface-alt)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              marginBottom: 7,
            }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 13px',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--r-sm)',
                fontSize: 14,
                background: 'var(--surface-alt)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px', fontSize: 14, justifyContent: 'center' }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-dim)' }}>
          アカウントをお持ちでない方は{' '}
          <Link to="/register" style={{ color: 'var(--accent)' }}>新規登録</Link>
        </p>
      </div>
    </div>
  )
}
