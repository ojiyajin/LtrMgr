import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, saveSettings } from '../api/settings'
import { importReferences } from '../api/import_'
import { exportDocuments } from '../api/export'
import type { AppSettings, ImportResult } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
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
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-dim)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
}

const codeStyle: React.CSSProperties = {
  background: 'var(--surface-high)',
  color: 'var(--accent)',
  padding: '1px 5px',
  borderRadius: 4,
  fontFamily: "'Fira Code', monospace",
  fontSize: 11,
}

const FONT_SIZES = [
  { key: 'small',  label: '小',   zoom: '0.85' },
  { key: 'medium', label: '中',   zoom: '1'    },
  { key: 'large',  label: '大',   zoom: '1.3'  },
  { key: 'xlarge', label: '特大', zoom: '1.6'  },
] as const

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const importRef = useRef<HTMLInputElement>(null)
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [form, setForm] = useState<AppSettings>({ pdf_rename_template: null, pdf_save_dir: null })
  const [saved, setSaved] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box settings-modal-box" onClick={(e) => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="modal-title" style={{ marginBottom: 0, flex: 1 }}>ファイル設定</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {isLoading ? (
          <p className="loading-text">読み込み中...</p>
        ) : (
          <>
            {/* Font size */}
            <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--surface-alt)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <p style={{ ...labelStyle, marginBottom: 10 }}>文字サイズ</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {FONT_SIZES.map(({ key, label, zoom }) => (
                  <button
                    key={key}
                    onClick={() => applyFontSize(key, zoom)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid',
                      fontSize: 12,
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
            </div>

            {/* Import / Export */}
            <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--surface-alt)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <p style={{ ...labelStyle, marginBottom: 12 }}>インポート / エクスポート</p>
              <input ref={importRef} type="file" accept=".bib,.ris" style={{ display: 'none' }} onChange={handleImportFile} />
              {importResult && (
                <div className={`import-banner ${importResult.errors.length ? 'import-banner-err' : 'import-banner-ok'}`} style={{ marginBottom: 10 }}>
                  <span>インポート完了: {importResult.created} 件追加, {importResult.skipped} 件スキップ{importResult.errors.length > 0 && ` (エラー: ${importResult.errors.length} 件)`}</span>
                  <button className="banner-close" onClick={() => setImportResult(null)}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => importRef.current?.click()} disabled={importMut.isPending}>
                  {importMut.isPending ? '取込中...' : '⬇ .bib / .ris'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => exportDocuments('bibtex')}>⬆ BibTeX</button>
                <button className="btn btn-ghost btn-sm" onClick={() => exportDocuments('ris')}>⬆ RIS</button>
              </div>
            </div>

            {/* PDF settings */}
            <div style={{ padding: '12px 14px', background: 'var(--surface-alt)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <p style={{ ...labelStyle, marginBottom: 14 }}>PDF ファイル設定</p>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>ファイル名テンプレート</label>
                <input
                  value={form.pdf_rename_template ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, pdf_rename_template: e.target.value || null }))}
                  placeholder="{first_author}_{year}_{title}"
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
                  変数: <code style={codeStyle}>{'{first_author}'}</code> <code style={codeStyle}>{'{year}'}</code> <code style={codeStyle}>{'{title}'}</code> <code style={codeStyle}>{'{doi}'}</code>
                </p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>保存フォルダ（絶対パス）</label>
                <input
                  value={form.pdf_save_dir ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, pdf_save_dir: e.target.value || null }))}
                  placeholder="/home/user/papers"
                  style={inputStyle}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                style={{ background: saved ? 'var(--green)' : undefined, borderColor: saved ? 'var(--green)' : undefined }}
              >
                {saved ? '✓ 保存しました' : saveMut.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
