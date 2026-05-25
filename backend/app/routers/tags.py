from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Tag
from app.schemas import TagCreate, TagUpdate, TagOut
from app.auth import get_current_user

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
async def list_tags(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.owner_id == user.id))
    return result.scalars().all()


@router.post("", response_model=TagOut, status_code=201)
async def create_tag(body: TagCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tag = Tag(owner_id=user.id, name=body.name, color=body.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, body: TagUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.owner_id == user.id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if body.name is not None:
        tag.name = body.name
    if body.color is not None:
        tag.color = body.color
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.owner_id == user.id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()
