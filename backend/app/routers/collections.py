from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Collection, Document, collection_document
from app.schemas import CollectionCreate, CollectionUpdate, CollectionOut
from app.auth import get_current_user

router = APIRouter(prefix="/api/collections", tags=["collections"])


async def _get_col(col_id: str, user: User, db: AsyncSession) -> Collection:
    r = await db.execute(
        select(Collection).where(Collection.id == col_id, Collection.owner_id == user.id)
    )
    col = r.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


@router.get("", response_model=list[CollectionOut])
async def list_collections(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Collection).where(Collection.owner_id == user.id).order_by(Collection.name)
    )
    cols = result.scalars().all()

    # Attach document counts
    counts_result = await db.execute(
        select(collection_document.c.collection_id, func.count().label("cnt"))
        .group_by(collection_document.c.collection_id)
    )
    counts = {row.collection_id: row.cnt for row in counts_result}

    out = []
    for c in cols:
        out.append(CollectionOut(
            id=c.id, name=c.name, created_at=c.created_at,
            document_count=counts.get(c.id, 0),
        ))
    return out


@router.post("", response_model=CollectionOut, status_code=201)
async def create_collection(
    body: CollectionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col = Collection(owner_id=user.id, name=body.name)
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return CollectionOut(id=col.id, name=col.name, created_at=col.created_at, document_count=0)


@router.patch("/{col_id}", response_model=CollectionOut)
async def update_collection(
    col_id: str, body: CollectionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col = await _get_col(col_id, user, db)
    col.name = body.name
    await db.commit()
    await db.refresh(col)
    return CollectionOut(id=col.id, name=col.name, created_at=col.created_at, document_count=0)


@router.delete("/{col_id}", status_code=204)
async def delete_collection(
    col_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col = await _get_col(col_id, user, db)
    await db.delete(col)
    await db.commit()


@router.post("/{col_id}/documents/{doc_id}", status_code=204)
async def add_document(
    col_id: str, doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col = await _get_col(col_id, user, db)
    doc_r = await db.execute(
        select(Document).where(Document.id == doc_id, Document.owner_id == user.id)
    )
    doc = doc_r.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check not already in collection
    exists = await db.execute(
        select(collection_document).where(
            collection_document.c.collection_id == col_id,
            collection_document.c.document_id == doc_id,
        )
    )
    if not exists.first():
        await db.execute(
            collection_document.insert().values(collection_id=col_id, document_id=doc_id)
        )
        await db.commit()


@router.delete("/{col_id}/documents/{doc_id}", status_code=204)
async def remove_document(
    col_id: str, doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_col(col_id, user, db)
    await db.execute(
        collection_document.delete().where(
            collection_document.c.collection_id == col_id,
            collection_document.c.document_id == doc_id,
        )
    )
    await db.commit()
