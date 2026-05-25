from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Document, Note
from app.schemas import NoteCreate, NoteUpdate, NoteOut
from app.auth import get_current_user

router = APIRouter(prefix="/api/documents/{doc_id}/notes", tags=["notes"])


async def _get_document(doc_id: str, user: User, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.owner_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("", response_model=list[NoteOut])
async def list_notes(doc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_document(doc_id, user, db)
    result = await db.execute(select(Note).where(Note.document_id == doc_id))
    return result.scalars().all()


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(doc_id: str, body: NoteCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_document(doc_id, user, db)
    note = Note(document_id=doc_id, content=body.content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(doc_id: str, note_id: str, body: NoteUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_document(doc_id, user, db)
    result = await db.execute(select(Note).where(Note.id == note_id, Note.document_id == doc_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.content = body.content
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(doc_id: str, note_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_document(doc_id, user, db)
    result = await db.execute(select(Note).where(Note.id == note_id, Note.document_id == doc_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
