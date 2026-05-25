// Persists dead-zone configuration in localStorage.
// A "dead zone" is a screen edge strip where touch/pointer events are ignored,
// so the user can hold a tablet without accidentally scrolling or drawing.

export type DeadZoneEdge = 'left' | 'right' | 'top' | 'bottom'

export interface DeadZoneConfig {
  left:   number  // px width  (0 = disabled)
  right:  number  // px width  (0 = disabled)
  top:    number  // px height (0 = disabled)
  bottom: number  // px height (0 = disabled)
}

const KEY = 'ltrmgr_dead_zone'
const DEFAULTS: DeadZoneConfig = { left: 0, right: 0, top: 0, bottom: 0 }

export function loadDeadZone(): DeadZoneConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveDeadZone(cfg: DeadZoneConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

export function isInDeadZone(x: number, y: number, cfg: DeadZoneConfig, topOffset = 0): boolean {
  if (y < topOffset) return false  // toolbar area is never a dead zone
  if (cfg.left   > 0 && x < cfg.left)                          return true
  if (cfg.right  > 0 && x > window.innerWidth  - cfg.right)    return true
  if (cfg.top    > 0 && y < topOffset + cfg.top)               return true
  if (cfg.bottom > 0 && y > window.innerHeight - cfg.bottom)   return true
  return false
}
