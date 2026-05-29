import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Table, Column, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.utcnow()


document_tag = Table(
    "document_tag",
    Base.metadata,
    Column("document_id", String, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

collection_document = Table(
    "collection_document",
    Base.metadata,
    Column("collection_id", String, ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
    Column("document_id", String, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
)


class DocumentType(str, enum.Enum):
    academic = "academic"
    patent = "patent"
    abstract = "abstract"
    textbook = "textbook"


class ReadStatus(str, enum.Enum):
    unread = "unread"
    reading = "reading"
    read = "read"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    username: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    documents: Mapped[list["Document"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    tags: Mapped[list["Tag"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    collections: Mapped[list["Collection"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    read_status: Mapped[str] = mapped_column(String, default="unread", server_default="unread", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    owner: Mapped["User"] = relationship(back_populates="documents")
    citation: Mapped["Citation"] = relationship(back_populates="document", cascade="all, delete-orphan", uselist=False)
    notes: Mapped[list["Note"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    tags: Mapped[list["Tag"]] = relationship(secondary=document_tag, back_populates="documents")
    pdf_files: Mapped[list["PDFFile"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    collections: Mapped[list["Collection"]] = relationship(secondary=collection_document, back_populates="documents")


class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id", ondelete="CASCADE"), unique=True)
    authors: Mapped[str | None] = mapped_column(Text)
    journal: Mapped[str | None] = mapped_column(String)
    volume: Mapped[str | None] = mapped_column(String)
    issue: Mapped[str | None] = mapped_column(String)
    pages: Mapped[str | None] = mapped_column(String)
    year: Mapped[int | None] = mapped_column(Integer)
    doi: Mapped[str | None] = mapped_column(String)
    url: Mapped[str | None] = mapped_column(String)
    publisher: Mapped[str | None] = mapped_column(String)
    patent_number: Mapped[str | None] = mapped_column(String)
    patent_office: Mapped[str | None] = mapped_column(String)
    conference: Mapped[str | None] = mapped_column(String)
    abstract_text: Mapped[str | None] = mapped_column(Text)

    document: Mapped["Document"] = relationship(back_populates="citation")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#6366f1")

    owner: Mapped["User"] = relationship(back_populates="tags")
    documents: Mapped[list["Document"]] = relationship(secondary=document_tag, back_populates="tags")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    document: Mapped["Document"] = relationship(back_populates="notes")


class PDFFile(Base):
    __tablename__ = "pdf_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    text_content: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    document: Mapped["Document"] = relationship(back_populates="pdf_files")


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    owner: Mapped["User"] = relationship(back_populates="collections")
    documents: Mapped[list["Document"]] = relationship(secondary=collection_document, back_populates="collections")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
