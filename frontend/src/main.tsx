import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

const FONT_ZOOMS: Record<string, string> = { small: '0.85', medium: '1', large: '1.15' }
const storedFont = localStorage.getItem('ltrmgr_font_size') ?? 'medium'
;(document.documentElement as HTMLElement).style.zoom = FONT_ZOOMS[storedFont] ?? '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
