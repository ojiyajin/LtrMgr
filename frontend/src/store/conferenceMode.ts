import { create } from 'zustand'

interface ConferenceModeState {
  active: boolean
  name: string
  year: number
}

interface ConferenceModeStore extends ConferenceModeState {
  tagName: string
  activate: (name: string, year: number) => void
  deactivate: () => void
}

const KEY = 'ltrmgr_conf_mode'

function load(): ConferenceModeState {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return JSON.parse(s)
  } catch {}
  return { active: false, name: '', year: new Date().getFullYear() }
}

function persist(s: ConferenceModeState) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

const initial = load()

export const useConferenceMode = create<ConferenceModeStore>((set) => ({
  ...initial,
  tagName: initial.active ? `${initial.year}_${initial.name}` : '',
  activate: (name, year) => {
    const s = { active: true, name, year }
    persist(s)
    set({ ...s, tagName: `${year}_${name}` })
  },
  deactivate: () => {
    const s = { active: false, name: '', year: new Date().getFullYear() }
    persist(s)
    set({ ...s, tagName: '' })
  },
}))
