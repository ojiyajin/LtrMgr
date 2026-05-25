"""Simple BibTeX and RIS parsers (no external dependencies)."""
import re
from typing import Any


# ── BibTeX ────────────────────────────────────────────────────────────────────

_ENTRY_START = re.compile(r'@(\w+)\s*\{', re.IGNORECASE)


def _find_entry_body(text: str, start: int) -> tuple[str, int]:
    """Return (body_content, end_pos) for a { … } block starting at start."""
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        c = text[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        i += 1
    return text[start: i - 1], i


def _parse_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    # Remove the citation key (first comma-delimited token)
    first_comma = body.find(',')
    if first_comma == -1:
        return fields
    body = body[first_comma + 1:]

    # Match  fieldname = {value}  or  fieldname = "value"  or  fieldname = number
    pattern = re.compile(
        r'(\w+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|(\d+))',
        re.DOTALL,
    )
    for m in pattern.finditer(body):
        key = m.group(1).lower()
        value = m.group(2) or m.group(3) or m.group(4) or ""
        fields[key] = " ".join(value.split())  # normalise whitespace
    return fields


def parse_bibtex(text: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    pos = 0
    while pos < len(text):
        m = _ENTRY_START.search(text, pos)
        if not m:
            break
        entry_type = m.group(1).lower()
        if entry_type == "comment":
            pos = m.end()
            continue
        body, end = _find_entry_body(text, m.end())
        fields = _parse_fields(body)
        entries.append({"_type": entry_type, **fields})
        pos = end
    return entries


# ── RIS ───────────────────────────────────────────────────────────────────────

def parse_ris(text: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) < 6 or line[2:6] != "  - ":
            continue
        tag = line[:2].strip()
        value = line[6:].strip()
        if tag == "ER":
            if current:
                entries.append(current)
            current = {}
        elif tag == "TY":
            current = {"_type": value}
        elif tag == "AU":
            current.setdefault("AU", []).append(value)
        else:
            current[tag] = value
    if current:
        entries.append(current)
    return entries


# ── Conversion to internal schema dicts ──────────────────────────────────────

def bibtex_to_document(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a parsed BibTeX entry to {title, doc_type, citation} dict."""
    title = entry.get("title", "").strip()
    if not title:
        return None

    etype = entry.get("_type", "misc")
    if etype in ("patent",):
        doc_type = "patent"
    elif etype in ("inproceedings", "proceedings", "conference"):
        doc_type = "abstract"
    else:
        doc_type = "academic"

    # Normalise authors: "Last, First and Last2, First2" → "Last, First, Last2, First2"
    raw_authors = entry.get("author", "")
    if raw_authors:
        parts = [a.strip() for a in re.split(r"\s+and\s+", raw_authors, flags=re.IGNORECASE)]
        authors = ", ".join(parts)
    else:
        authors = None

    year_str = entry.get("year", "")
    year = int(year_str) if year_str.isdigit() else None

    citation = {
        "authors": authors,
        "journal": entry.get("journal") or entry.get("journaltitle") or None,
        "conference": entry.get("booktitle") or None,
        "volume": entry.get("volume") or None,
        "issue": entry.get("number") or None,
        "pages": entry.get("pages") or None,
        "year": year,
        "doi": entry.get("doi") or None,
        "url": entry.get("url") or None,
        "publisher": entry.get("publisher") or None,
        "patent_number": entry.get("number") if doc_type == "patent" else None,
        "abstract_text": entry.get("abstract") or None,
    }
    return {"title": title, "doc_type": doc_type, "citation": citation}


def ris_to_document(entry: dict[str, Any]) -> dict[str, Any] | None:
    title = entry.get("TI") or entry.get("T1", "")
    if not title:
        return None

    ris_type = entry.get("_type", "JOUR")
    if ris_type in ("PAT",):
        doc_type = "patent"
    elif ris_type in ("CONF", "CPAPER"):
        doc_type = "abstract"
    else:
        doc_type = "academic"

    authors_list: list[str] = entry.get("AU", [])
    authors = ", ".join(authors_list) if authors_list else None

    year_str = entry.get("PY") or entry.get("Y1", "")
    year = int(year_str[:4]) if year_str and year_str[:4].isdigit() else None

    sp = entry.get("SP", "")
    ep = entry.get("EP", "")
    pages = f"{sp}-{ep}" if sp and ep else sp or ep or None

    citation = {
        "authors": authors,
        "journal": entry.get("JO") or entry.get("JF") or entry.get("T2") or None,
        "conference": entry.get("T2") if doc_type == "abstract" else None,
        "volume": entry.get("VL") or None,
        "issue": entry.get("IS") or None,
        "pages": pages,
        "year": year,
        "doi": entry.get("DO") or None,
        "url": entry.get("UR") or None,
        "publisher": entry.get("PB") or None,
        "abstract_text": entry.get("AB") or None,
    }
    return {"title": title, "doc_type": doc_type, "citation": citation}
