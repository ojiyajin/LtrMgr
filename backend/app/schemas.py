from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.models import DocumentType


# --- Auth ---

class TeamJoin(BaseModel):
    username: str


class UserCreate(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: Optional[str] = None
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Citation ---

class CitationBase(BaseModel):
    authors: Optional[str] = None
    journal: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    publisher: Optional[str] = None
    patent_number: Optional[str] = None
    patent_office: Optional[str] = None
    conference: Optional[str] = None
    abstract_text: Optional[str] = None


class CitationOut(CitationBase):
    id: str

    model_config = {"from_attributes": True}


# --- Tag ---

class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class TagOut(BaseModel):
    id: str
    name: str
    color: str

    model_config = {"from_attributes": True}


# --- Note ---

class NoteCreate(BaseModel):
    content: str


class NoteUpdate(BaseModel):
    content: str


class NoteOut(BaseModel):
    id: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- PDF ---

class MarkdownContentUpdate(BaseModel):
    content: str


class PDFFileOut(BaseModel):
    id: str
    filename: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class PDFUploadResult(PDFFileOut):
    doi_detected: Optional[str] = None
    metadata_updated: bool = False


# --- Collection ---

class CollectionCreate(BaseModel):
    name: str


class CollectionUpdate(BaseModel):
    name: str


class CollectionOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    document_count: int = 0

    model_config = {"from_attributes": True}


# --- Document ---

class DocumentCreate(BaseModel):
    doc_type: DocumentType
    title: str
    citation: Optional[CitationBase] = None
    tag_ids: list[str] = []


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[DocumentType] = None
    citation: Optional[CitationBase] = None
    tag_ids: Optional[list[str]] = None
    read_status: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    doc_type: DocumentType
    title: str
    read_status: str = "unread"
    citation: Optional[CitationOut] = None
    tags: list[TagOut] = []
    notes: list[NoteOut] = []
    pdf_files: list[PDFFileOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentSummary(BaseModel):
    id: str
    doc_type: DocumentType
    title: str
    read_status: str = "unread"
    citation: Optional[CitationOut] = None
    tags: list[TagOut] = []
    pdf_files: list[PDFFileOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- DOI lookup ---

class DOILookupResult(BaseModel):
    title: str
    citation: CitationBase


# --- Duplicate check ---

class DuplicateCheckResult(BaseModel):
    duplicates: list[DocumentSummary] = []


# --- Import ---

class ImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = []


# --- File rename ---

class RenameFileBody(BaseModel):
    filename: str


class BulkRenameFilesBody(BaseModel):
    doc_ids: list[str]
    skip_file_ids: list[str] = []


# --- Settings ---

class AppSettings(BaseModel):
    pdf_rename_template: Optional[str] = None
    pdf_save_dir: Optional[str] = None


# --- Search / Filter ---

class DocumentFilter(BaseModel):
    q: Optional[str] = None
    doc_type: Optional[DocumentType] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    author: Optional[str] = None
    journal: Optional[str] = None
    tag_ids: Optional[list[str]] = None
    read_status: Optional[str] = None
    collection_id: Optional[str] = None
    skip: int = 0
    limit: int = 50
