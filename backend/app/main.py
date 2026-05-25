import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.database import init_db
from app.routers import auth, documents, tags, notes, files, export, import_, collections, settings

app = FastAPI(title="LtrMgr API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(tags.router)
app.include_router(notes.router)
app.include_router(files.router)
app.include_router(export.router)
app.include_router(import_.router)
app.include_router(collections.router)
app.include_router(settings.router)


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- SPA static file serving ---
_FRONTEND = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "dist",
)
_FRONTEND_ALT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static_frontend",
)


def _frontend_dir() -> str | None:
    if os.path.isdir(_FRONTEND):
        return _FRONTEND
    if os.path.isdir(_FRONTEND_ALT):
        return _FRONTEND_ALT
    return None


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    base = _frontend_dir()
    if base is None:
        return {"error": "Frontend not built. Run: cd frontend && npm run build"}
    candidate = os.path.join(base, full_path)
    if os.path.isfile(candidate):
        return FileResponse(candidate)
    return FileResponse(os.path.join(base, "index.html"))
