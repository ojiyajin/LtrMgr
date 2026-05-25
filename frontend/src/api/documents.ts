import { client, apiBase } from './client'
import type {
  DocumentSummary, DocumentDetail, DocumentCreate, DocumentUpdate,
  DOILookupResult, ListDocumentsParams, PDFUploadResult, ReadStatus,
} from '../types'

export async function listDocuments(params: ListDocumentsParams = {}): Promise<DocumentSummary[]> {
  const p: Record<string, string | number | string[]> = {}
  if (params.q) p.q = params.q
  if (params.doc_type) p.doc_type = params.doc_type
  if (params.year_from) p.year_from = params.year_from
  if (params.year_to) p.year_to = params.year_to
  if (params.author) p.author = params.author
  if (params.journal) p.journal = params.journal
  if (params.tag_ids?.length) p.tag_ids = params.tag_ids
  if (params.read_status) p.read_status = params.read_status
  if (params.collection_id) p.collection_id = params.collection_id
  if (params.skip !== undefined) p.skip = params.skip
  if (params.limit !== undefined) p.limit = params.limit
  const { data } = await client.get<DocumentSummary[]>('/documents', { params: p })
  return data
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const { data } = await client.get<DocumentDetail>(`/documents/${id}`)
  return data
}

export async function createDocument(body: DocumentCreate): Promise<DocumentDetail> {
  const { data } = await client.post<DocumentDetail>('/documents', body)
  return data
}

export async function updateDocument(id: string, body: DocumentUpdate): Promise<DocumentDetail> {
  const { data } = await client.patch<DocumentDetail>(`/documents/${id}`, body)
  return data
}

export async function updateReadStatus(id: string, status: ReadStatus): Promise<void> {
  await client.patch(`/documents/${id}`, { read_status: status })
}

export async function deleteDocument(id: string): Promise<void> {
  await client.delete(`/documents/${id}`)
}

export async function lookupDOI(doi: string): Promise<DOILookupResult> {
  const { data } = await client.get<DOILookupResult>('/documents/doi-lookup', { params: { doi } })
  return data
}

export async function checkDuplicate(doi?: string, title?: string, excludeId?: string) {
  const params: Record<string, string> = {}
  if (doi) params.doi = doi
  if (title) params.title = title
  if (excludeId) params.exclude_id = excludeId
  const { data } = await client.get<{ duplicates: DocumentSummary[] }>('/documents/check-duplicate', { params })
  return data
}

export async function uploadPDF(docId: string, file: File): Promise<PDFUploadResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post<PDFUploadResult>(`/documents/${docId}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function fetchPDFFromDOI(docId: string): Promise<void> {
  await client.post(`/documents/${docId}/files/fetch`)
}

export async function deletePDF(docId: string, fileId: string): Promise<void> {
  await client.delete(`/documents/${docId}/files/${fileId}`)
}

export function getPDFDownloadUrl(docId: string, fileId: string): string {
  return `${apiBase}/documents/${docId}/files/${fileId}/download`
}

export function getPDFViewUrl(docId: string, fileId: string): string {
  return `${apiBase}/documents/${docId}/files/${fileId}/view`
}

export async function getFileContent(docId: string, fileId: string): Promise<string> {
  const { data } = await client.get<string>(`/documents/${docId}/files/${fileId}/content`, { responseType: 'text' })
  return data
}

export async function updateFileContent(docId: string, fileId: string, content: string): Promise<void> {
  await client.patch(`/documents/${docId}/files/${fileId}/content`, { content })
}

export async function renameFile(docId: string, fileId: string, filename: string): Promise<{ id: string; filename: string; uploaded_at: string }> {
  const { data } = await client.patch(`/documents/${docId}/files/${fileId}/rename`, { filename })
  return data
}

export async function bulkRenameFiles(docIds: string[], skipFileIds: string[]): Promise<{ renamed: string[] }> {
  const { data } = await client.post<{ renamed: string[] }>('/documents/bulk-rename-files', {
    doc_ids: docIds,
    skip_file_ids: skipFileIds,
  })
  return data
}
