import { apiBase } from './client'

function downloadBlob(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export function exportDocuments(format: 'bibtex' | 'ris', ids?: string[]) {
  const params = new URLSearchParams({ format })
  ids?.forEach(id => params.append('ids', id))
  // Include auth token
  const token = localStorage.getItem('token')
  if (token) params.append('token', token)
  const url = `${apiBase}/export?${params}`
  downloadBlob(url, format === 'bibtex' ? 'references.bib' : 'references.ris')
}
