import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, saveSettings } from '../api/settings'
import { importReferences } from '../api/import_'
import { exportDocuments } from '../api/export'
import { Layout } from '../components/Layout'
import type { AppSettings, ImportResult } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  transition: 'border-color 0.14s',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-dim)',
  display: 'block',
  marginBottom: 7,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
}

const codeStyle: React.CSSProperties = {
  background: 'var(--surface-high)',
  color: 'var(--accent)',
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: "'Fira Code', monospace",
  fontSize: 12,
}

const FONT_SIZES = [
  { key: 'small',  label: '小',      zoom: '0.85' },
  { key: 'medium', label: '中（標準）', zoom: '1'    },
  { key: 'large',  label: '大',      zoom: '1.3'  },
  { key: 'xlarge', label: '特大',    zoom: '1.6'  },
] as const

export function SettingsPage() {
  const qc = useQueryClient()
  const importRef = useRef<HTMLInputElement>(null)
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [form, setForm] = useState<AppSettings>({ pdf_rename_template: null, pdf_save_dir: null })
  const [saved, setSaved] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [fontSize, setFontSizeState] = useState(() => localStorage.getItem('ltrmgr_font_size') ?? 'medium')

  function applyFontSize(key: string, zoom: string) {
    localStorage.setItem('ltrmgr_font_size', key)
    ;(document.documentElement as HTMLElement).style.zoom = zoom
    setFontSizeState(key)
  }

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveMut = useMutation({
    mutationFn: () => saveSettings(form),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    },
  })

  const importMut = useMutation({
    mutationFn: (file: File) => importReferences(file),
    onSuccess: (result) => {
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { importMut.mutate(file); e.target.value = '' }
  }

  if (isLoading) {
    return (
      <Layout>
        <div style={{ padding: 40 }}>
          <p className="loading-text">読み込み中...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 28px' }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            marginBottom: 26,
          }}>
            ファイル設定
          </h1>

          {/* Font size section */}
          <div className="detail-card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>
              文字サイズ
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {FONT_SIZES.map(({ key, label, zoom }) => (
                <button
                  key={key}
                  onClick={() => applyFontSize(key, zoom)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: fontSize === key ? 'var(--accent)' : 'transparent',
                    color: fontSize === key ? '#0c0e12' : 'var(--text-muted)',
                    borderColor: fontSize === key ? 'var(--accent)' : 'var(--border-light)',
                    fontWeight: fontSize === key ? 700 : 400,
                    transition: 'all 0.14s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
              ページを再読み込みしなくても即時反映されます
            </p>
          </div>

          {/* Import / Export section */}
          <div className="detail-card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>
              インポート / エクスポート
            </h2>

            <input
              ref={importRef}
              type="file"
              accept=".bib,.ris"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />

            {/* Import result banner */}
            {importResult && (
              <div
                className={`import-banner ${importResult.errors.length ? 'import-banner-err' : 'import-banner-ok'}`}
                style={{ marginBottom: 16 }}
              >
                <span>
                  インポート完了: {importResult.created} 件追加, {importResult.skipped} 件スキップ
                  {importResult.errors.length > 0 && ` (エラー: ${importResult.errors.length} 件)`}
                </span>
                <button className="banner-close" onClick={() => setImportResult(null)}>✕</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <p style={{ ...labelStyle, marginBottom: 10 }}>インポート</p>
                <button
                  className="btn btn-ghost"
                  onClick={() => importRef.current?.click()}
                  disabled={importMut.isPending}
                >
                  {importMut.isPending ? '取込中...' : '⬇ .bib / .ris を取り込む'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  BibTeX (.bib) または RIS (.ris) 形式のファイルを読み込みます
                </p>
              </div>

              <div style={{ borderLeft: '1px solid var(--border)', margin: '0 4px' }} />

              <div>
                <p style={{ ...labelStyle, marginBottom: 10 }}>エクスポート</p>
                <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { exportDocuments('bibtex') }}
                  >
                    ⬆ BibTeX (.bib)
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { exportDocuments('ris') }}
                  >
                    ⬆ RIS (.ris)
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  登録されているすべての文献をダウンロードします
                </p>
              </div>
            </div>
          </div>

          {/* PDF settings */}
          <div className="detail-card">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 22 }}>
              PDF ファイル設定
            </h2>

            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>ファイル名テンプレート</label>
              <input
                value={form.pdf_rename_template ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, pdf_rename_template: e.target.value || null }))}
                placeholder="例: {first_author}_{year}_{title}"
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.7 }}>
                使用可能な変数:{' '}
                <code style={codeStyle}>{'{first_author}'}</code>{' '}
                <code style={codeStyle}>{'{year}'}</code>{' '}
                <code style={codeStyle}>{'{title}'}</code>{' '}
                <code style={codeStyle}>{'{doi}'}</code>
                <br />
                空白の場合はオリジナルのファイル名を使用します
              </p>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>保存フォルダ（絶対パス）</label>
              <input
                value={form.pdf_save_dir ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, pdf_save_dir: e.target.value || null }))}
                placeholder="例: /home/user/papers"
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                空白の場合はデフォルトのアップロードフォルダを使用します
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              style={{
                background: saved ? 'var(--green)' : undefined,
                borderColor: saved ? 'var(--green)' : undefined,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              {saved ? '✓ 保存しました' : saveMut.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
