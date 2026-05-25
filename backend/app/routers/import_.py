from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Document, Citation, Tag, document_tag
from app.schemas import ImportResult
from app.auth import get_current_user
from app.services.bib_parser import parse_bibtex, parse_ris, bibtex_to_document, ris_to_document

router = APIRouter(prefix="/api/import", tags=["import"])


async def _create_from_dict(data: dict, user: User, db: AsyncSession) -> bool:
    """Insert one document. Returns False if skipped (duplicate DOI)."""
    cit_data = data.get("citation") or {}
    doi = cit_data.get("doi")

    # Duplicate check by DOI
    if doi:
        existing = await db.execute(
            select(Citation).where(Citation.doi == doi)
        )
        if existing.scalar_one_or_none():
            return False

    doc = Document(owner_id=user.id, doc_type=data["doc_type"], title=data["title"])
    db.add(doc)
    await db.flush()

    if any(v for v in cit_data.values() if v is not None):
        cit = Citation(document_id=doc.id, **{k: v for k, v in cit_data.items() if v is not None})
        db.add(cit)

    return True


@router.post("", response_model=ImportResult)
async def import_references(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw = (await file.read()).decode("utf-8", errors="replace")
    filename = (file.filename or "").lower()

    if filename.endswith(".bib"):
        entries = parse_bibtex(raw)
        convert = bibtex_to_document
    elif filename.endswith(".ris"):
        entries = parse_ris(raw)
        convert = ris_to_document
    else:
        raise HTTPException(status_code=400, detail=".bib または .ris ファイルを選択してください")

    created = skipped = 0
    errors: list[str] = []

    for i, entry in enumerate(entries):
        try:
            data = convert(entry)
            if not data:
                skipped += 1
                continue
            ok = await _create_from_dict(data, user, db)
            if ok:
                created += 1
            else:
                skipped += 1
        except Exception as e:
            errors.append(f"エントリ {i + 1}: {e}")

    await db.commit()
    return ImportResult(created=created, skipped=skipped, errors=errors)
