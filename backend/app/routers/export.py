from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional

from app.database import get_db
from app.models import User, Document, DocumentType
from app.auth import get_current_user

router = APIRouter(prefix="/api/export", tags=["export"])


def _bibtex_key(doc: Document) -> str:
    c = doc.citation
    author = ""
    if c and c.authors:
        first = c.authors.split(",")[0].strip()
        author = first.split()[-1] if first else ""
    year = str(c.year) if c and c.year else ""
    word = doc.title.split()[0] if doc.title else "untitled"
    raw = f"{author}{year}{word}"
    return "".join(ch for ch in raw if ch.isalnum())


def _to_bibtex(doc: Document) -> str:
    c = doc.citation
    etype = {
        DocumentType.academic: "article",
        DocumentType.patent: "patent",
        DocumentType.abstract: "inproceedings",
        DocumentType.textbook: "book",
    }.get(doc.doc_type, "misc")

    key = _bibtex_key(doc)
    fields = [f"  title = {{{doc.title}}}"]
    if c:
        if c.authors:
            bib_authors = " and ".join(a.strip() for a in c.authors.split(","))
            fields.append(f"  author = {{{bib_authors}}}")
        if c.year:
            fields.append(f"  year = {{{c.year}}}")
        if c.journal:
            fields.append(f"  journal = {{{c.journal}}}")
        if c.conference:
            fields.append(f"  booktitle = {{{c.conference}}}")
        if c.volume:
            fields.append(f"  volume = {{{c.volume}}}")
        if c.issue:
            fields.append(f"  number = {{{c.issue}}}")
        if c.pages:
            fields.append(f"  pages = {{{c.pages}}}")
        if c.publisher:
            fields.append(f"  publisher = {{{c.publisher}}}")
        if c.doi:
            fields.append(f"  doi = {{{c.doi}}}")
        if c.url:
            fields.append(f"  url = {{{c.url}}}")
        if c.abstract_text:
            fields.append(f"  abstract = {{{c.abstract_text}}}")

    return f"@{etype}{{{key},\n" + ",\n".join(fields) + "\n}"


def _to_ris(doc: Document) -> str:
    c = doc.citation
    ty = {
        DocumentType.academic: "JOUR",
        DocumentType.patent: "PAT",
        DocumentType.abstract: "CONF",
        DocumentType.textbook: "BOOK",
    }.get(doc.doc_type, "GEN")

    lines = [f"TY  - {ty}", f"TI  - {doc.title}"]
    if c:
        if c.authors:
            for a in c.authors.split(","):
                lines.append(f"AU  - {a.strip()}")
        if c.year:
            lines.append(f"PY  - {c.year}")
        if c.journal:
            lines.append(f"JO  - {c.journal}")
        if c.conference:
            lines.append(f"T2  - {c.conference}")
        if c.volume:
            lines.append(f"VL  - {c.volume}")
        if c.issue:
            lines.append(f"IS  - {c.issue}")
        if c.pages:
            parts = c.pages.replace("–", "-").split("-")
            lines.append(f"SP  - {parts[0].strip()}")
            if len(parts) > 1:
                lines.append(f"EP  - {parts[1].strip()}")
        if c.publisher:
            lines.append(f"PB  - {c.publisher}")
        if c.doi:
            lines.append(f"DO  - {c.doi}")
        if c.url:
            lines.append(f"UR  - {c.url}")
        if c.abstract_text:
            lines.append(f"AB  - {c.abstract_text}")
    lines.append("ER  - ")
    return "\n".join(lines)


@router.get("")
async def export_documents(
    format: str = Query("bibtex", pattern="^(bibtex|ris)$"),
    ids: Optional[list[str]] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Document)
        .where(Document.owner_id == user.id)
        .options(selectinload(Document.citation))
    )
    if ids:
        stmt = stmt.where(Document.id.in_(ids))

    result = await db.execute(stmt)
    docs = list(result.scalars().all())

    if format == "bibtex":
        content = "\n\n".join(_to_bibtex(d) for d in docs)
        filename = "references.bib"
    else:
        content = "\n\n".join(_to_ris(d) for d in docs)
        filename = "references.ris"

    return Response(
        content=content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
