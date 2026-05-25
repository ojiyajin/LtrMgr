import { useState } from 'react'
import { loadDeadZone, saveDeadZone, type DeadZoneConfig } from '../store/deadZone'

interface Props {
  show: boolean
  onClose: () => void
  onChange: (cfg: DeadZoneConfig) => void
}

const EDGES: { key: keyof DeadZoneConfig; label: string; hint: string }[] = [
  { key: 'left',   label: '左',  hint: 'タブレットを右手で持つ時に設定' },
  { key: 'right',  label: '右',  hint: 'タブレットを左手で持つ時に設定' },
  { key: 'top',    label: '上',  hint: '上端の誤タッチ防止' },
  { key: 'bottom', label: '下',  hint: '下端の誤タッチ防止' },
]

const PRESETS = [
  { label: 'なし',   cfg: { left: 0, right: 0, top: 0, bottom: 0 } },
  { label: '右手持ち', cfg: { left: 60, right: 0, top: 0, bottom: 0 } },
  { label: '左手持ち', cfg: { left: 0, right: 60, top: 0, bottom: 0 } },
]

export function DeadZonePanel({ show, onClose, onChange }: Props) {
  const [cfg, setCfg] = useState<DeadZoneConfig>(() => loadDeadZone())

  if (!show) return null

  function update(key: keyof DeadZoneConfig, val: number) {
    const next = { ...cfg, [key]: val }
    setCfg(next)
    saveDeadZone(next)
    onChange(next)
  }

  function applyPreset(preset: DeadZoneConfig) {
    setCfg(preset)
    saveDeadZone(preset)
    onChange(preset)
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 299 }}
      />
      <div style={{
        position: 'fixed', bottom: 52, right: 12, zIndex: 300,
        background: '#0f172a', border: '1px solid #1e3a5f',
        borderRadius: 10, padding: '16px 18px', width: 260,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e6ef', flex: 1 }}>
            タッチ不感領域
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.cfg)}
              style={{
                flex: 1, padding: '5px 6px', borderRadius: 6, fontSize: 11,
                border: '1px solid',
                cursor: 'pointer', fontFamily: 'inherit',
                background: JSON.stringify(cfg) === JSON.stringify(p.cfg) ? '#6366f1' : 'transparent',
                color: JSON.stringify(cfg) === JSON.stringify(p.cfg) ? '#fff' : '#94a3b8',
                borderColor: JSON.stringify(cfg) === JSON.stringify(p.cfg) ? '#6366f1' : '#1e3a5f',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Sliders */}
        {EDGES.map(({ key, label, hint }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {label}端
              </span>
              <span style={{ fontSize: 11, color: cfg[key] > 0 ? '#d4a843' : '#475569', fontFamily: 'monospace' }}>
                {cfg[key] > 0 ? `${cfg[key]}px` : 'OFF'}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={cfg[key]}
              onChange={e => update(key, Number(e.target.value))}
              style={{ width: '100%', accentColor: '#d4a843' }}
            />
            <p style={{ fontSize: 10, color: '#334155', marginTop: 2 }}>{hint}</p>
          </div>
        ))}

        {/* Visual indicator */}
        <div style={{ marginTop: 8, position: 'relative', height: 80, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#334155' }}>
            画面プレビュー
          </span>
          {cfg.left   > 0 && <div style={{ position: 'absolute', left: 0,   top: 0, bottom: 0, width:  `${Math.min(cfg.left   / window.innerWidth  * 100, 40)}%`, background: 'rgba(212,168,67,0.25)', borderRight: '2px solid rgba(212,168,67,0.6)' }} />}
          {cfg.right  > 0 && <div style={{ position: 'absolute', right: 0,  top: 0, bottom: 0, width:  `${Math.min(cfg.right  / window.innerWidth  * 100, 40)}%`, background: 'rgba(212,168,67,0.25)', borderLeft:  '2px solid rgba(212,168,67,0.6)' }} />}
          {cfg.top    > 0 && <div style={{ position: 'absolute', top: 0,    left: 0, right: 0, height: `${Math.min(cfg.top    / window.innerHeight * 100, 40)}%`, background: 'rgba(212,168,67,0.25)', borderBottom:'2px solid rgba(212,168,67,0.6)' }} />}
          {cfg.bottom > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${Math.min(cfg.bottom / window.innerHeight * 100, 40)}%`, background: 'rgba(212,168,67,0.25)', borderTop:   '2px solid rgba(212,168,67,0.6)' }} />}
        </div>
      </div>
    </>
  )
}
