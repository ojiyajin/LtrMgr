from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def _migrate(conn):
    """Add columns/tables introduced after the initial schema."""
    # username column on users (auth mode support)
    rows = await conn.execute(text("PRAGMA table_info(users)"))
    user_cols = {r[1] for r in rows.fetchall()}
    if "username" not in user_cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR"))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users(username) WHERE username IS NOT NULL"
        ))

    # read_status column on documents
    rows = await conn.execute(text("PRAGMA table_info(documents)"))
    cols = {r[1] for r in rows.fetchall()}
    if "read_status" not in cols:
        await conn.execute(text(
            "ALTER TABLE documents ADD COLUMN read_status VARCHAR NOT NULL DEFAULT 'unread'"
        ))

    # Drop unique constraint on pdf_files.document_id (multi-file support)
    idx_rows = await conn.execute(text("PRAGMA index_list(pdf_files)"))
    indexes = idx_rows.fetchall()
    unique_on_doc_id = False
    for row in indexes:
        if row[2] == 1:  # unique flag
            col_rows = await conn.execute(text(f"PRAGMA index_info({row[1]})"))
            if any(r[2] == "document_id" for r in col_rows.fetchall()):
                unique_on_doc_id = True
                break
    if unique_on_doc_id:
        await conn.execute(text("""
            CREATE TABLE pdf_files_new (
                id VARCHAR NOT NULL PRIMARY KEY,
                document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                filename VARCHAR NOT NULL,
                path VARCHAR NOT NULL,
                text_content TEXT,
                uploaded_at DATETIME
            )
        """))
        await conn.execute(text(
            "INSERT INTO pdf_files_new SELECT id, document_id, filename, path, text_content, uploaded_at FROM pdf_files"
        ))
        await conn.execute(text("DROP TABLE pdf_files"))
        await conn.execute(text("ALTER TABLE pdf_files_new RENAME TO pdf_files"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)
