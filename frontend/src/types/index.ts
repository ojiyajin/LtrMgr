export type DocumentType = 'academic' | 'patent' | 'abstract' | 'textbook'
export type ReadStatus = 'unread' | 'reading' | 'read'

export interface Citation {
  id: string
  authors?: string
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  year?: number
  doi?: string
  url?: string
  publisher?: string
  patent_number?: string
  patent_office?: string
  conference?: string
  abstract_text?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Note {
  id: string
  content: string
  created_at: string
  updated_at: string
}

export interface PDFFile {
  id: string
  filename: string
  uploaded_at: string
}

export interface PDFUploadResult extends PDFFile {
  doi_detected: string | null
  metadata_updated: boolean
}

export interface Collection {
  id: string
  name: string
  created_at: string
  document_count: number
}

export interface DocumentSummary {
  id: string
  doc_type: DocumentType
  title: string
  read_status: ReadStatus
  citation?: Citation
  tags: Tag[]
  pdf_files: PDFFile[]
  created_at: string
  updated_at: string
}

export interface DocumentDetail extends DocumentSummary {
  notes: Note[]
  collections: Collection[]
}

export interface DocumentCreate {
  doc_type: DocumentType
  title: string
  citation?: Partial<Omit<Citation, 'id'>>
  tag_ids?: string[]
}

export interface DocumentUpdate {
  title?: string
  doc_type?: DocumentType
  citation?: Partial<Omit<Citation, 'id'>>
  tag_ids?: string[]
  read_status?: ReadStatus
}

export interface DOILookupResult {
  title: string
  citation: Partial<Omit<Citation, 'id'>>
}

export interface ImportResult {
  created: number
  skipped: number
  errors: string[]
}

export interface AppSettings {
  pdf_rename_template: string | null
  pdf_save_dir: string | null
}

export interface ListDocumentsParams {
  q?: string
  doc_type?: DocumentType
  year_from?: number
  year_to?: number
  author?: string
  journal?: string
  tag_ids?: string[]
  read_status?: ReadStatus
  collection_id?: string
  skip?: number
  limit?: number
}
