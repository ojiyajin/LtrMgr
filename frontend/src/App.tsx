import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { LoginPage } from './pages/LoginPage'
import { DocumentListPage } from './pages/DocumentListPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { DocumentFormPage } from './pages/DocumentFormPage'
import { TagsPage } from './pages/TagsPage'
import { PdfMarkupPage } from './pages/PdfMarkupPage'
import { MarkdownViewPage } from './pages/MarkdownViewPage'
import { SettingsPage } from './pages/SettingsPage'
import { getAuthMode } from './api/auth'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: mode, isLoading } = useQuery({
    queryKey: ['authMode'],
    queryFn: getAuthMode,
    staleTime: Infinity,
  })
  if (isLoading) return null
  // Personal mode: no token required
  if (mode === 'personal') return <>{children}</>
  // Team / Secure: require a token
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

const FONT_ZOOM: Record<string, string> = { small: '0.85', medium: '1', large: '1.3', xlarge: '1.6' }

export default function App() {
  useEffect(() => {
    const key = localStorage.getItem('ltrmgr_font_size') ?? 'medium'
    const zoom = FONT_ZOOM[key] ?? '1'
    document.documentElement.style.zoom = zoom
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/documents" element={<RequireAuth><DocumentListPage /></RequireAuth>} />
          <Route path="/documents/new" element={<RequireAuth><DocumentFormPage /></RequireAuth>} />
          <Route path="/documents/:id" element={<RequireAuth><DocumentDetailPage /></RequireAuth>} />
          <Route path="/documents/:id/edit" element={<RequireAuth><DocumentFormPage /></RequireAuth>} />
          <Route path="/documents/:id/markup/:fileId" element={<RequireAuth><PdfMarkupPage /></RequireAuth>} />
          <Route path="/documents/:id/markdown/:fileId" element={<RequireAuth><MarkdownViewPage /></RequireAuth>} />
          <Route path="/tags" element={<RequireAuth><TagsPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/documents" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
