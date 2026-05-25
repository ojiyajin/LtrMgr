import re
import fitz  # PyMuPDF

_DOI_RE = re.compile(r'\b(10\.\d{4,9}/[^\s,;:"\'<>\[\]{}\\]+)', re.IGNORECASE)


def extract_text(path: str) -> str:
    doc = fitz.open(path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def extract_doi(text: str) -> str | None:
    """Extract the first DOI found in the text."""
    m = _DOI_RE.search(text)
    if m:
        return m.group(1).rstrip(".,;)")
    return None
