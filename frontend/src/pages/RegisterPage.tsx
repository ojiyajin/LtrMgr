import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register, login } from '../api/auth'
import { useAuthStore } from '../store/auth'

export function RegisterPage() {
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
      await register({ email, password })
      const token = await login({ username: email, password })
      setToken(token)
      navigate('/documents')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ width: 380, background: '#fff', borderRadius: 12, padding: '40px 36px', boxShadow: '0 4px 24px #0001' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 28 }}>新規登録</h1>
        {error && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>パスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
          </div>
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px', background: '#6366f1', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {loading ? '登録中...' : 'アカウント作成'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
          すでにアカウントをお持ちの方は <Link to="/login" style={{ color: '#6366f1' }}>ログイン</Link>
        </p>
      </div>
    </div>
  )
}
