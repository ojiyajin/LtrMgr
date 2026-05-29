from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import TeamJoin, UserCreate, UserOut, Token
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/mode")
async def get_auth_mode():
    """Return the current auth mode so the frontend can render the correct login UI."""
    return {"mode": settings.auth_mode}


@router.post("/join", response_model=Token, status_code=201)
async def team_join(body: TeamJoin, db: AsyncSession = Depends(get_db)):
    """Team mode: enter with a username only. User is created on first join."""
    if settings.auth_mode != "team":
        raise HTTPException(status_code=403, detail="Team モード以外では使用できません")
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="ユーザー名を入力してください")
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            username=username,
            email=f"{username}@team.ltrmgr",
            hashed_password="(team-mode)",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return Token(access_token=create_access_token(user.id))


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Secure mode: register a new user with username + password."""
    if settings.auth_mode != "secure":
        raise HTTPException(status_code=403, detail="Secure モード以外では使用できません")
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="ユーザー名を入力してください")
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="そのユーザー名は既に使用されています")
    user = User(
        username=username,
        email=f"{username}@secure.ltrmgr",
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Secure mode: login with username + password."""
    if settings.auth_mode != "secure":
        raise HTTPException(status_code=403, detail="Secure モード以外では使用できません")
    result = await db.execute(select(User).where(User.username == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザー名またはパスワードが正しくありません",
        )
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
