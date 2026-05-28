import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConferenceMode } from '../store/conferenceMode'
import { SettingsModal } from './SettingsModal'

export function Layout({ children, hideFabs = false }: { children: React.ReactNode; hideFabs?: boolean }) {
  const navigate = useNavigate()
  const cm = useConferenceMode()

  const [menuOpen, setMenuOpen] = useState(false)
  const [showConfForm, setShowConfForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formYear, setFormYear] = useState(String(new Date().getFullYear()))
  const [showSettings, setShowSettings] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
    setShowConfForm(false)
  }

  function handleActivate() {
    if (!formName.trim() || !formYear) return
    cm.activate(formName.trim(), Number(formYear))
    setShowConfForm(false)
    setFormName('')
    setMenuOpen(false)
  }

  return (
    <div className="app-layout">

      {/* ── Hamburger FAB ── */}
      {!hideFabs && (
        <button
          className={`fab-menu${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
        >
          <span className={`hamburger-icon${menuOpen ? ' open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>
      )}

      {/* ── Add document FAB ── */}
      {!hideFabs && (
        <button
          className="fab-add"
          onClick={() => { navigate('/documents/new'); closeMenu() }}
          title="文献を追加"
          aria-label="文献を追加"
        >
          ＋
        </button>
      )}

      {/* ── Menu popup overlay (transparent, closes on click outside) ── */}
      {!hideFabs && menuOpen && (
        <div className="fab-popup-overlay" onClick={closeMenu} />
      )}

      {/* ── Menu popup above the hamburger FAB ── */}
      {!hideFabs && menuOpen && (
        <div className="fab-popup-menu">
          {/* Conference mode section */}
          <div className="fab-popup-conf">
            {cm.active ? (
              <div>
                <div className="conf-active-indicator">
                  <span className="conf-dot" />
                  <span className="conf-active-label">学会参加中</span>
                </div>
                <p className="conf-name">{cm.name}</p>
                <p className="conf-year">{cm.year}年</p>
                <span className="conf-tag-chip">🏷 {cm.tagName}</span>
                <button className="btn-conf-exit" onClick={() => { cm.deactivate(); closeMenu() }}>
                  モードを終了
                </button>
              </div>
            ) : showConfForm ? (
              <div>
                <p className="conf-form-title">学会参加モードを開始</p>
                <div style={{ marginBottom: 7 }}>
                  <input
                    className="conf-input"
                    placeholder="学会名"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <input
                    className="conf-input"
                    type="number"
                    placeholder="年"
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                  />
                </div>
                {formName.trim() && formYear && (
                  <p className="conf-tag-preview">{formYear}_{formName.trim()}</p>
                )}
                <div className="conf-form-actions">
                  <button
                    className="conf-start-btn"
                    onClick={handleActivate}
                    disabled={!formName.trim() || !formYear}
                  >
                    開始
                  </button>
                  <button
                    className="conf-cancel-btn"
                    onClick={() => { setShowConfForm(false); setFormName('') }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-conf-start" onClick={() => setShowConfForm(true)}>
                ＋ 学会参加モード
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="fab-popup-actions">
            <button
              className="fab-popup-action-btn"
              onClick={() => { setShowSettings(true); closeMenu() }}
            >
              <span style={{ fontSize: 12, opacity: 0.7 }}>◎</span>
              ファイル設定
            </button>
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <div className="main-area">{children}</div>
    </div>
  )
}
