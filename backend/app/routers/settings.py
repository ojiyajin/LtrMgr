from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import AppSetting
from app.schemas import AppSettings
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/settings", tags=["settings"])

_KEYS = {"pdf_rename_template", "pdf_save_dir"}


@router.get("", response_model=AppSettings)
async def get_settings(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting).where(AppSetting.key.in_(_KEYS)))
    data = {s.key: s.value for s in result.scalars().all()}
    return AppSettings(**{k: data.get(k) for k in AppSettings.model_fields})


@router.put("", response_model=AppSettings)
async def update_settings(
    body: AppSettings,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for key, value in body.model_dump().items():
        r = await db.execute(select(AppSetting).where(AppSetting.key == key))
        s = r.scalar_one_or_none()
        if s:
            s.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    await db.commit()
    return body
