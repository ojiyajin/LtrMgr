import os
import re
import shutil

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import User, Document, PDFFile, Citation, AppSetting
from app.schemas import PDFFileOut, PDFUploadResult, MarkdownContentUpdate, RenameFileBody
from app.auth import get_current_user
from app.services.pdf_parser import extract_text, extract_doi
from app.services.doi_lookup import lookup_doi, fetch_pdf_url_from_doi

router = APIRouter(prefix="/api/documents/{doc_id}/files", tags=["files"])


async def _get_document(doc_id: str, user: User, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.owner_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def _get_file(doc_id: str, file_id: str, user: User, db: AsyncSession) -> PDFFile:
    await _get_document(doc_id, user, db)
    result = await db.execute(
        select(PDFFile).where(PDFFile.id == file_id, PDFFile.document_id == doc_id)
    )
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    return pf


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    return s.value if s else None


def _make_pdf_filename(template: str, doc: Document, original: str) -> str:
    c = doc.citation
    first_author = ""
    if c and c.authors:
        first = c.authors.split(",")[0].strip()
        first_author = first.split()[-1] if first else ""
    year = str(c.year) if c and c.year else "XXXX"
    title_words = "_".join(doc.title.split()[:5]) if doc.title else "untitled"
    doi_safe = (c.doi or "").replace("/", "_") if c else ""
    try:
        name = template.format(
            first_author=first_author, year=year,
            title=title_words, doi=doi_safe,
        )
    except KeyError:
        return original
    name = re.sub(r'[<>:"/\\|?*]', '_', name).strip("_. ")
    if not name:
        name = "document"
    if not name.endswith(".pdf"):
        name += ".pdf"
    return name


def _resolve_path(file_id: str, filename: str, save_dir: str | None, is_md: bool) -> str:
    folder = save_dir if save_dir and os.path.isdir(save_dir) else settings.upload_dir
    os.makedirs(folder, exist_ok=True)
    ext = ".md" if is_md else ".pdf"
    dest = os.path.join(folder, filename if save_dir else f"{file_id}{ext}")
    return dest


@router.post("", response_model=PDFUploadResult, status_code=201)
async def upload_file(
    doc_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_document(doc_id, user, db)

    fname = (file.filename or "").lower()
    is_md = fname.endswith(".md")
    is_pdf = fname.endswith(".pdf")
    if not is_pdf and not is_md:
        raise HTTPException(status_code=400, detail="PDF または Markdown (.md) ファイルのみ受け付けています")

    original_name = file.filename or (f"new.md" if is_md else f"new.pdf")

    # Always create a new PDFFile record
    pdf_file = PDFFile(document_id=doc_id, filename=original_name, path="", text_content=None)
    db.add(pdf_file)
    await db.flush()  # get the new id

    if is_md:
        save_dir = await _get_setting(db, "pdf_save_dir")
        dest = _resolve_path(pdf_file.id, original_name, save_dir, is_md=True)
        raw = await file.read()
        with open(dest, "wb") as f:
            f.write(raw)
        text_content = raw.decode("utf-8", errors="replace")
        pdf_file.filename = original_name
        pdf_file.path = dest
        pdf_file.text_content = text_content

        await db.commit()
        await db.refresh(pdf_file)
        return PDFUploadResult(
            id=pdf_file.id, filename=pdf_file.filename, uploaded_at=pdf_file.uploaded_at,
            doi_detected=None, metadata_updated=False,
        )

    rename_tpl = await _get_setting(db, "pdf_rename_template")
    save_dir = await _get_setting(db, "pdf_save_dir")

    final_name = _make_pdf_filename(rename_tpl, doc, original_name) if rename_tpl else original_name
    dest = _resolve_path(pdf_file.id, final_name, save_dir, is_md=False)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    text_content = extract_text(dest)
    pdf_file.filename = final_name
    pdf_file.path = dest
    pdf_file.text_content = text_content

    doi_detected = None
    metadata_updated = False
    doi = extract_doi(text_content)
    if doi:
        doi_detected = doi
        cit_result = await db.execute(select(Citation).where(Citation.document_id == doc_id))
        cit = cit_result.scalar_one_or_none()
        if not cit or not cit.doi:
            lookup = await lookup_doi(doi)
            if lookup:
                if cit:
                    for field, value in lookup.citation.model_dump(exclude_none=True).items():
                        if not getattr(cit, field, None):
                            setattr(cit, field, value)
                else:
                    cit = Citation(document_id=doc_id, **lookup.citation.model_dump())
                    db.add(cit)
                base_name = original_name.removesuffix(".pdf")
                if doc.title in (original_name, base_name):
                    doc.title = lookup.title
                metadata_updated = True

    await db.commit()
    await db.refresh(pdf_file)
    return PDFUploadResult(
        id=pdf_file.id, filename=pdf_file.filename, uploaded_at=pdf_file.uploaded_at,
        doi_detected=doi_detected, metadata_updated=metadata_updated,
    )


@router.post("/fetch", response_model=PDFFileOut, status_code=201)
async def fetch_pdf_from_doi(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_document(doc_id, user, db)

    cit_result = await db.execute(select(Citation).where(Citation.document_id == doc_id))
    cit = cit_result.scalar_one_or_none()
    if not cit or not cit.doi:
        raise HTTPException(status_code=400, detail="この文献にはDOIが設定されていません")

    pdf_url = await fetch_pdf_url_from_doi(cit.doi)
    if not pdf_url:
        raise HTTPException(status_code=404, detail="オープンアクセスのPDFが見つかりませんでした")

    rename_tpl = await _get_setting(db, "pdf_rename_template")
    save_dir = await _get_setting(db, "pdf_save_dir")

    url_name = pdf_url.split("/")[-1].split("?")[0]
    if not url_name or "." not in url_name:
        url_name = "fetched.pdf"
    if not url_name.endswith(".pdf"):
        url_name += ".pdf"

    final_name = _make_pdf_filename(rename_tpl, doc, url_name) if rename_tpl else url_name

    pdf_file = PDFFile(document_id=doc_id, filename=final_name, path="", text_content=None)
    db.add(pdf_file)
    await db.flush()

    dest = _resolve_path(pdf_file.id, final_name, save_dir, is_md=False)

    try:
        headers = {"User-Agent": f"LtrMgr/1.0 (mailto:{settings.crossref_email})"}
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            r = await client.get(pdf_url, headers=headers)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"PDFのダウンロードに失敗しました (HTTP {r.status_code})")
            ct = r.headers.get("content-type", "")
            if "pdf" not in ct.lower() and "octet-stream" not in ct.lower():
                raise HTTPException(status_code=502, detail="取得したファイルがPDFではありませんでした")
            with open(dest, "wb") as f:
                f.write(r.content)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="PDFのダウンロード中にエラーが発生しました")

    try:
        text_content = extract_text(dest)
    except Exception:
        text_content = ""

    pdf_file.path = dest
    pdf_file.text_content = text_content

    await db.commit()
    await db.refresh(pdf_file)
    return pdf_file


@router.get("/{file_id}/download")
async def download_file(
    doc_id: str, file_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    if not os.path.exists(pf.path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    media = "text/markdown" if pf.path.endswith(".md") else "application/pdf"
    return FileResponse(pf.path, media_type=media, filename=pf.filename)


@router.get("/{file_id}/view")
async def view_file(
    doc_id: str, file_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    if not os.path.exists(pf.path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    media = "text/markdown" if pf.path.endswith(".md") else "application/pdf"
    return FileResponse(pf.path, media_type=media, headers={"Content-Disposition": "inline"})


@router.get("/{file_id}/content")
async def get_file_content(
    doc_id: str, file_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    if pf.text_content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return PlainTextResponse(pf.text_content)


@router.patch("/{file_id}/content")
async def update_file_content(
    doc_id: str,
    file_id: str,
    body: MarkdownContentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    if not pf.path.endswith(".md"):
        raise HTTPException(status_code=400, detail="Markdown ファイルのみ編集できます")
    try:
        with open(pf.path, "w", encoding="utf-8") as f:
            f.write(body.content)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"ファイルの書き込みに失敗しました: {e}")
    pf.text_content = body.content
    await db.commit()
    return PlainTextResponse(body.content)


@router.patch("/{file_id}/rename", response_model=PDFFileOut)
async def rename_file(
    doc_id: str,
    file_id: str,
    body: RenameFileBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    new_name = body.filename.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="ファイル名を入力してください")
    new_name = re.sub(r'[<>:"/\\|?*]', '_', new_name)
    is_md = pf.filename.endswith('.md')
    if is_md and not new_name.endswith('.md'):
        new_name += '.md'
    elif not is_md and not new_name.endswith('.pdf'):
        new_name += '.pdf'

    save_dir = await _get_setting(db, "pdf_save_dir")
    if save_dir and os.path.isdir(save_dir):
        new_path = os.path.join(save_dir, new_name)
        if os.path.exists(pf.path) and pf.path != new_path:
            os.rename(pf.path, new_path)
        pf.path = new_path

    pf.filename = new_name
    await db.commit()
    await db.refresh(pf)
    return pf


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    doc_id: str, file_id: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    pf = await _get_file(doc_id, file_id, user, db)
    if os.path.exists(pf.path):
        os.remove(pf.path)
    await db.delete(pf)
    await db.commit()
