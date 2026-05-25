import fnmatch
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import Optional

from app.config import settings
from app.database import get_db
from app.models import User, Document, Citation, Tag, DocumentType, document_tag, collection_document
from app.schemas import (
    DocumentCreate, DocumentUpdate, DocumentOut, DocumentSummary,
    DOILookupResult, DuplicateCheckResult, BulkRenameFilesBody,
)
from app.auth import get_current_user
from app.services.doi_lookup import lookup_doi

router = APIRouter(prefix="/api/documents", tags=["documents"])

_LOAD_FULL = [
    selectinload(Document.citation),
    selectinload(Document.tags),
    selectinload(Document.notes),
    selectinload(Document.pdf_files),
    selectinload(Document.collections),
]
_LOAD_SUMMARY = [
    selectinload(Document.citation),
    selectinload(Document.tags),
    selectinload(Document.pdf_files),
]


def _wildcard_to_like(pattern: str) -> str:
    return pattern.replace("%", r"\%").replace("_", r"\_").replace("*", "%").replace("?", "_")


def _matches_wildcard(text: str, pattern: str) -> bool:
    return fnmatch.fnmatch(text.lower(), pattern.lower())


def _apply_text_filter(docs: list[Document], q: str) -> list[Document]:
    pattern = q if ("*" in q or "?" in q) else f"*{q}*"
    out = []
    for doc in docs:
        fields = [doc.title]
        if doc.citation:
            c = doc.citation
            fields += [f or "" for f in [c.authors, c.journal, c.doi, c.publisher, c.conference, c.patent_number]]
        for pf in doc.pdf_files:
            if pf.text_content:
                fields.append(pf.text_content[:10000])
        combined = " ".join(fields)
        if _matches_wildcard(combined, pattern):
            out.append(doc)
    return out


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    q: Optional[str] = Query(None),
    doc_type: Optional[DocumentType] = Query(None),
    year_from: Optional[int] = Query(None),
    year_to: Optional[int] = Query(None),
    author: Optional[str] = Query(None),
    journal: Optional[str] = Query(None),
    tag_ids: Optional[list[str]] = Query(None),
    read_status: Optional[str] = Query(None),
    collection_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).where(Document.owner_id == user.id).options(*_LOAD_SUMMARY)

    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if read_status:
        stmt = stmt.where(Document.read_status == read_status)
    if tag_ids:
        for tid in tag_ids:
            stmt = stmt.where(Document.tags.any(Tag.id == tid))
    if collection_id:
        stmt = stmt.where(
            Document.id.in_(
                select(collection_document.c.document_id).where(
                    collection_document.c.collection_id == collection_id
                )
            )
        )
    if year_from or year_to or author or journal:
        stmt = stmt.join(Document.citation)
        if year_from:
            stmt = stmt.where(Citation.year >= year_from)
        if year_to:
            stmt = stmt.where(Citation.year <= year_to)
        if author:
            stmt = stmt.where(Citation.authors.ilike(f"%{author}%"))
        if journal:
            stmt = stmt.where(Citation.journal.ilike(f"%{journal}%"))

    result = await db.execute(stmt)
    docs = list(result.scalars().unique().all())

    if q:
        docs = _apply_text_filter(docs, q)

    return docs[skip: skip + limit]


@router.get("/check-duplicate", response_model=DuplicateCheckResult)
async def check_duplicate(
    doi: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    exclude_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Feature 6: return existing documents that match the given DOI or exact title."""
    if not doi and not title:
        return DuplicateCheckResult(duplicates=[])

    stmt = select(Document).where(Document.owner_id == user.id).options(*_LOAD_SUMMARY)
    conditions = []

    if doi:
        conditions.append(Document.citation.has(Citation.doi == doi))
    if title:
        stmt2 = stmt.where(Document.title.ilike(title))
        if exclude_id:
            stmt2 = stmt2.where(Document.id != exclude_id)
        r2 = await db.execute(stmt2)
        title_matches = list(r2.scalars().unique().all())
    else:
        title_matches = []

    doi_matches: list[Document] = []
    if doi:
        stmt3 = stmt.where(Document.citation.has(Citation.doi == doi))
        if exclude_id:
            stmt3 = stmt3.where(Document.id != exclude_id)
        r3 = await db.execute(stmt3)
        doi_matches = list(r3.scalars().unique().all())

    seen = set()
    combined = []
    for d in doi_matches + title_matches:
        if d.id not in seen:
            seen.add(d.id)
            combined.append(d)

    return DuplicateCheckResult(duplicates=combined)


@router.post("", response_model=DocumentOut, status_code=201)
async def create_document(body: DocumentCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = Document(owner_id=user.id, doc_type=body.doc_type, title=body.title)
    db.add(doc)
    await db.flush()

    if body.citation:
        cit = Citation(document_id=doc.id, **body.citation.model_dump())
        db.add(cit)

    if body.tag_ids:
        tag_result = await db.execute(select(Tag).where(Tag.id.in_(body.tag_ids), Tag.owner_id == user.id))
        tags = list(tag_result.scalars().all())
        for tag in tags:
            await db.execute(document_tag.insert().values(document_id=doc.id, tag_id=tag.id))

    await db.commit()
    result = await db.execute(select(Document).where(Document.id == doc.id).options(*_LOAD_FULL))
    return result.scalar_one()


@router.get("/doi-lookup", response_model=DOILookupResult)
async def doi_lookup(doi: str = Query(...), _: User = Depends(get_current_user)):
    result = await lookup_doi(doi)
    if not result:
        raise HTTPException(status_code=404, detail="DOI not found")
    return result


@router.post("/bulk-rename-files")
async def bulk_rename_files(
    body: BulkRenameFilesBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.routers.files import _make_pdf_filename, _get_setting
    rename_tpl = await _get_setting(db, "pdf_rename_template")
    if not rename_tpl:
        raise HTTPException(status_code=400, detail="リネームテンプレートが設定されていません")

    save_dir = await _get_setting(db, "pdf_save_dir")
    renamed_ids: list[str] = []

    for doc_id in body.doc_ids:
        result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.owner_id == user.id)
            .options(*_LOAD_FULL)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            continue

        pdf_files = [pf for pf in doc.pdf_files
                     if not pf.filename.endswith('.md')
                     and pf.id not in body.skip_file_ids]
        if not pdf_files:
            continue

        base_name = _make_pdf_filename(rename_tpl, doc, pdf_files[0].filename)
        stem = base_name[:-4]

        for idx, pf in enumerate(pdf_files):
            new_name = base_name if len(pdf_files) == 1 else f"{stem}_{idx + 1}.pdf"
            if new_name == pf.filename:
                continue
            if save_dir and os.path.isdir(save_dir):
                new_path = os.path.join(save_dir, new_name)
                if os.path.exists(pf.path) and pf.path != new_path:
                    os.rename(pf.path, new_path)
                pf.path = new_path
            pf.filename = new_name
            renamed_ids.append(pf.id)

    await db.commit()
    return {"renamed": renamed_ids}


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.owner_id == user.id).options(*_LOAD_FULL)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(doc_id: str, body: DocumentUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.owner_id == user.id).options(*_LOAD_FULL)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.title is not None:
        doc.title = body.title
    if body.doc_type is not None:
        doc.doc_type = body.doc_type
    if body.read_status is not None:
        doc.read_status = body.read_status

    if body.citation is not None:
        if doc.citation:
            for k, v in body.citation.model_dump(exclude_none=True).items():
                setattr(doc.citation, k, v)
        else:
            cit = Citation(document_id=doc.id, **body.citation.model_dump())
            db.add(cit)

    if body.tag_ids is not None:
        tag_result = await db.execute(select(Tag).where(Tag.id.in_(body.tag_ids), Tag.owner_id == user.id))
        doc.tags = list(tag_result.scalars().all())

    await db.commit()
    result = await db.execute(
        select(Document).where(Document.id == doc_id).options(*_LOAD_FULL)
    )
    return result.scalar_one()


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.owner_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()
