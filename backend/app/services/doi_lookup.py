import re
import httpx
from typing import Optional
from xml.etree import ElementTree as ET
from html.parser import HTMLParser

from app.config import settings
from app.schemas import DOILookupResult, CitationBase

_ARXIV_ID_RE = re.compile(
    r'(?:arxiv\.org/(?:abs|pdf)/|arxiv:|arXiv:)?'
    r'(\d{4}\.\d{4,5}(?:v\d+)?)',
    re.IGNORECASE,
)
_ARXIV_DOI_RE = re.compile(r'10\.48550/arxiv\.(\d{4}\.\d{4,5})', re.IGNORECASE)


class _TagStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str):
        self._parts.append(data)

    @classmethod
    def strip(cls, html: str) -> str:
        p = cls()
        p.feed(html)
        return " ".join(" ".join(p._parts).split())


def _extract_arxiv_id(text: str) -> Optional[str]:
    m = _ARXIV_DOI_RE.match(text.strip())
    if m:
        return m.group(1)
    m = _ARXIV_ID_RE.search(text.strip())
    if m:
        return m.group(1)
    return None


async def _lookup_crossref(doi: str) -> Optional[DOILookupResult]:
    url = f"https://api.crossref.org/works/{doi}"
    headers = {"User-Agent": f"LtrMgr/1.0 (mailto:{settings.crossref_email})"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=headers)
        if r.status_code != 200:
            return None
        data = r.json().get("message", {})

    title_list = data.get("title", [])
    title = title_list[0] if title_list else "Unknown"

    authors_raw = data.get("author", [])
    authors = ", ".join(
        f"{a.get('family', '')}, {a.get('given', '')}".strip(", ")
        for a in authors_raw
    ) or None

    year = None
    for date_key in ("published", "published-print", "published-online", "issued"):
        parts = data.get(date_key, {}).get("date-parts", [[]])
        if parts and parts[0]:
            year = parts[0][0]
            break

    container = (data.get("container-title") or [])
    container_name = container[0] if container else None

    doc_type = data.get("type", "")
    is_proceedings = doc_type in ("proceedings-article", "proceedings")

    abstract_html = data.get("abstract") or ""
    abstract_text = _TagStripper.strip(abstract_html) if abstract_html else None

    citation = CitationBase(
        authors=authors,
        journal=None if is_proceedings else container_name,
        conference=container_name if is_proceedings else None,
        volume=data.get("volume"),
        issue=data.get("issue"),
        pages=data.get("page"),
        year=year,
        doi=doi,
        url=data.get("URL"),
        publisher=data.get("publisher"),
        abstract_text=abstract_text,
    )
    return DOILookupResult(title=title, citation=citation)


async def _lookup_arxiv(arxiv_id: str) -> Optional[DOILookupResult]:
    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        if r.status_code != 200:
            return None

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }
    try:
        root = ET.fromstring(r.text)
    except ET.ParseError:
        return None

    entry = root.find("atom:entry", ns)
    if entry is None:
        return None

    title_el = entry.find("atom:title", ns)
    title = " ".join((title_el.text or "").split()) if title_el is not None else "Unknown"

    authors = [
        el.find("atom:name", ns).text
        for el in entry.findall("atom:author", ns)
        if el.find("atom:name", ns) is not None
    ]

    year = None
    pub_el = entry.find("atom:published", ns)
    if pub_el is not None and pub_el.text:
        year = int(pub_el.text[:4])

    doi_el = entry.find("arxiv:doi", ns)
    doi = doi_el.text.strip() if doi_el is not None else f"10.48550/arXiv.{arxiv_id}"

    id_el = entry.find("atom:id", ns)
    arxiv_url = id_el.text.strip() if id_el is not None else f"https://arxiv.org/abs/{arxiv_id}"

    summary_el = entry.find("atom:summary", ns)
    abstract_text = " ".join((summary_el.text or "").split()) if summary_el is not None else None

    citation = CitationBase(
        authors=", ".join(authors) if authors else None,
        year=year,
        doi=doi,
        url=arxiv_url,
        publisher="arXiv",
        abstract_text=abstract_text,
    )
    return DOILookupResult(title=title, citation=citation)


async def fetch_pdf_url_from_doi(doi: str) -> Optional[str]:
    """Use Unpaywall API to find a legal open-access PDF URL for the given DOI."""
    from app.config import settings
    url = f"https://api.unpaywall.org/v2/{doi}?email={settings.crossref_email}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            data = r.json()
    except Exception:
        return None

    best = data.get("best_oa_location") or {}
    if best.get("url_for_pdf"):
        return best["url_for_pdf"]
    for loc in data.get("oa_locations", []):
        if loc.get("url_for_pdf"):
            return loc["url_for_pdf"]
    return None


async def lookup_doi(query: str) -> Optional[DOILookupResult]:
    """
    Accept: standard DOI, arXiv DOI (10.48550/arXiv.*),
            arXiv ID (XXXX.XXXXX), arXiv URL, arXiv:ID prefix.
    """
    query = query.strip()

    # Detect arXiv input
    arxiv_id = _extract_arxiv_id(query)

    # If it looks purely like an arXiv ID (not a full DOI), go to arXiv API directly
    if arxiv_id and not query.startswith("10."):
        result = await _lookup_arxiv(arxiv_id)
        if result:
            return result

    # Try CrossRef for standard DOIs and arXiv DOIs
    doi = query if query.startswith("10.") else (f"10.48550/arXiv.{arxiv_id}" if arxiv_id else None)
    if doi:
        result = await _lookup_crossref(doi)
        if result:
            return result

    # Fallback: arXiv API for arXiv DOIs
    if arxiv_id:
        return await _lookup_arxiv(arxiv_id)

    return None
