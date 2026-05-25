import { useState } from 'react'
import type { DocumentDetail } from '../types'

type Style = 'APA' | 'MLA' | 'Vancouver'

function formatAPA(doc: DocumentDetail): string {
  const c = doc.citation
  if (!c) return doc.title
  const authors = c.authors
    ? c.authors.split(',').map(a => {
        const parts = a.trim().split(' ')
        const last = parts[0]
        const initials = parts.slice(1).map(p => p[0] ? p[0] + '.' : '').join(' ')
        return initials ? `${last}, ${initials}` : last
      }).join(', ')
    : ''
  const year = c.year ? `(${c.year})` : ''
  const journal = c.journal ? `*${c.journal}*` : c.conference ? `*${c.conference}*` : ''
  const vol = c.volume ? `, *${c.volume}*` : ''
  const issue = c.issue ? `(${c.issue})` : ''
  const pages = c.pages ? `, ${c.pages}` : ''
  const doi = c.doi ? ` https://doi.org/${c.doi}` : c.url ? ` ${c.url}` : ''
  return `${authors} ${year}. ${doc.title}. ${journal}${vol}${issue}${pages}.${doi}`.replace(/\s+/g, ' ').trim()
}

function formatMLA(doc: DocumentDetail): string {
  const c = doc.citation
  if (!c) return doc.title
  const authors = c.authors
    ? (() => {
        const parts = c.authors.split(',').map(a => a.trim())
        if (parts.length === 1) return parts[0]
        return `${parts[0]}, et al`
      })()
    : ''
  const journal = c.journal || c.conference || ''
  const vol = c.volume ? `vol. ${c.volume}` : ''
  const issue = c.issue ? `no. ${c.issue}` : ''
  const year = c.year ? `${c.year}` : ''
  const pages = c.pages ? `pp. ${c.pages}` : ''
  const parts = [vol, issue, year, pages].filter(Boolean).join(', ')
  const doi = c.doi ? ` https://doi.org/${c.doi}` : ''
  return `${authors}. "${doc.title}." ${journal ? `*${journal}*, ` : ''}${parts}.${doi}`.replace(/\s+/g, ' ').trim()
}

function formatVancouver(doc: DocumentDetail): string {
  const c = doc.citation
  if (!c) return doc.title
  const authors = c.authors
    ? c.authors.split(',').map(a => {
        const parts = a.trim().split(' ')
        const last = parts[0]
        const initials = parts.slice(1).map(p => p[0] || '').join('')
        return `${last} ${initials}`
      }).join(', ')
    : ''
  const journal = c.journal || c.conference || ''
  const year = c.year ? `${c.year}` : ''
  const vol = c.volume || ''
  const issue = c.issue ? `(${c.issue})` : ''
  const pages = c.pages ? `:${c.pages}` : ''
  const doi = c.doi ? ` doi:${c.doi}` : ''
  return `${authors}. ${doc.title}. ${journal}. ${year};${vol}${issue}${pages}.${doi}`.replace(/\s+/g, ' ').trim()
}

const FORMATTERS: Record<Style, (d: DocumentDetail) => string> = {
  APA: formatAPA,
  MLA: formatMLA,
  Vancouver: formatVancouver,
}

export function CitationFormatter({ doc }: { doc: DocumentDetail }) {
  const [style, setStyle] = useState<Style>('APA')
  const [copied, setCopied] = useState(false)

  const text = FORMATTERS[style](doc)

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>引用スタイル</span>
        {(['APA', 'MLA', 'Vancouver'] as Style[]).map(s => (
          <button key={s} onClick={() => setStyle(s)} style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: '1px solid',
            background: style === s ? '#6366f1' : 'transparent',
            color: style === s ? '#fff' : 'var(--text-muted)',
            borderColor: style === s ? '#6366f1' : 'var(--border-light)',
          }}>{s}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={copy} style={{
          padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
          background: copied ? 'var(--green-dim)' : 'transparent',
          border: '1px solid var(--border-light)',
          color: copied ? 'var(--green)' : 'var(--text-muted)',
        }}>
          {copied ? '✓ コピー済み' : 'コピー'}
        </button>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', userSelect: 'text' }}>{text}</p>
    </div>
  )
}
