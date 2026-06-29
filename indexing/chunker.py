"""
chunker.py — Text splitting with category metadata tagging.

Every chunk produced here gets three metadata fields:
    source       str   — filename (e.g. "OISD_114.pdf")
    source_path  str   — full path on disk
    category     str   — detected domain label (see CATEGORY_RULES below)
    chunk_index  int   — position within the source document

Categories
----------
safety_regulation   OISD standards, PESO, fire/hazard/emergency docs
regulatory          PNGRB, MoPNG circulars, pipeline regulations
delegation          Delegation of Powers, approval authority tables
hr                  HR policies, leave rules, salary, appraisal
procurement         Purchase, tender, vendor, supply docs
equipment           Maintenance, asset management
general             Fallback when no rule matches
"""

import re
from pathlib import Path
from typing import Optional

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ─────────────────────────────────────────────────────────────────────────────
# Category detection rules
# (evaluated in order — first match wins)
# ─────────────────────────────────────────────────────────────────────────────

_RULES: list[tuple[re.Pattern, str]] = [
    # Safety / fire / hazard standards
    (re.compile(r"oisd|safety|hazard|fire.?protection|emergency|esd|gas.?leak|lpg|petroleum", re.I),
     "safety_regulation"),
    (re.compile(r"peso|explosive|pressure.?vessel|staticelectr", re.I),
     "safety_regulation"),

    # Pipeline / regulatory bodies
    (re.compile(r"pngrb|pipeline|cgd|city.?gas|authorisation", re.I),
     "regulatory"),
    (re.compile(r"mopng|ministry.?of.?petroleum|circular|gazette", re.I),
     "regulatory"),

    # Delegation of Powers
    (re.compile(r"delegation|dop|approval.?authority|power.?to.?sanction|financial.?power", re.I),
     "delegation"),

    # HR & personnel
    (re.compile(r"\bhr\b|human.?resource|leave.?rule|salary|appraisal|transfer|promotion|service.?rule", re.I),
     "hr"),

    # Procurement & supply
    (re.compile(r"procurement|purchase.?order|tender|rate.?contract|vendor|supply|mm.?module", re.I),
     "procurement"),

    # Equipment & maintenance
    (re.compile(r"equipment|maintenance|asset|inspection|overhau|calibrat", re.I),
     "equipment"),
]

_DEFAULT_CATEGORY = "general"


def detect_category(filename: str, content_snippet: str = "") -> str:
    """
    Detect the domain category of a document.

    Args:
        filename:        The PDF filename (path basename is fine).
        content_snippet: Optional first ~500 characters of extracted text
                         used as a fallback when the filename is generic.

    Returns:
        A category string from the taxonomy above.
    """
    name = Path(filename).name
    for pattern, category in _RULES:
        if pattern.search(name):
            return category

    # Filename didn't match — try a quick content scan
    if content_snippet:
        snippet = content_snippet[:600]
        for pattern, category in _RULES:
            if pattern.search(snippet):
                return category

    return _DEFAULT_CATEGORY


# ─────────────────────────────────────────────────────────────────────────────
# Helper to extract section title
# ─────────────────────────────────────────────────────────────────────────────

def extract_section_title(text: str) -> Optional[str]:
    """
    Extract a likely section header or title from the text chunk.
    Look for patterns like:
      - '4.2 LPG Storage'
      - 'Section 4.2'
      - 'Table 3'
    """
    # 1. Look for numbered sections like "4.2 LPG Storage" or "10.1 Fire Protection"
    # Match digit patterns like "4.2", "4.2.1" followed by a capitalized word/title
    pattern_num_title = re.compile(
        r"(?:^|\n)\s*(\d+(?:\.\d+)+)\s+([A-Z][A-Za-z0-9\s,/–\-]{3,50})",
        re.M
    )
    match = pattern_num_title.search(text)
    if match:
        num, title = match.groups()
        return f"Section {num} ({title.strip()})"

    # 2. Look for "Section X" or "Clause X" or "Table X"
    pattern_section = re.compile(
        r"\b(Section|Clause|Table)\s+(\d+(?:\.\d+)*)\b",
        re.I
    )
    match = pattern_section.search(text)
    if match:
        name, num = match.groups()
        return f"{name.title()} {num}"

    # 3. Fallback to any line that is completely uppercase and short (heading-like)
    for line in text.split("\n"):
        line = line.strip()
        if 5 < len(line) < 40 and line.isupper() and not line.isdigit():
            # Exclude lines starting with page numbers or standard footers
            if not re.search(r"page|oisd|pngrb", line, re.I):
                return line

    return None

# ─────────────────────────────────────────────────────────────────────────────
# Main chunking function
# ─────────────────────────────────────────────────────────────────────────────

def chunk_document(
    text_or_pages: str | list[dict],
    source: str,
    chunk_size: int = 600,
    chunk_overlap: int = 200,
    category: Optional[str] = None,
) -> list[Document]:
    """
    Split text (or list of page dicts) into overlapping chunks and attach metadata.

    Args:
        text_or_pages: Full text string OR list of parsed page dicts.
        source:        Path or filename of the source document.
        chunk_size:    Target token/character size per chunk.
        chunk_overlap: Overlap between consecutive chunks.
        category:      Override auto-detection.

    Returns:
        List of LangChain Document objects with metadata:
            source, source_path, category, chunk_index, page, section.
    """
    if category is None:
        if isinstance(text_or_pages, list):
            full_text = "\n\n".join(p["text"] for p in text_or_pages)
        else:
            full_text = text_or_pages
        category = detect_category(source, full_text)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    base_metadata = {
        "source": Path(source).name,
        "source_path": str(source),
        "category": category,
    }

    docs = []
    chunk_index = 0

    if isinstance(text_or_pages, list):
        # Page-by-page chunking to retain page numbers
        for page in text_or_pages:
            page_text = page.get("text", "")
            page_num = page.get("metadata", {}).get("page")
            
            page_docs = splitter.create_documents(
                texts=[page_text],
                metadatas=[base_metadata],
            )
            for doc in page_docs:
                doc.metadata["chunk_index"] = chunk_index
                if page_num is not None:
                    doc.metadata["page"] = page_num
                
                sect = extract_section_title(doc.page_content)
                if sect:
                    doc.metadata["section"] = sect
                
                docs.append(doc)
                chunk_index += 1
    else:
        # Backward compatibility for plain string
        page_docs = splitter.create_documents(
            texts=[text_or_pages],
            metadatas=[base_metadata],
        )
        for doc in page_docs:
            doc.metadata["chunk_index"] = chunk_index
            sect = extract_section_title(doc.page_content)
            if sect:
                doc.metadata["section"] = sect
            docs.append(doc)
            chunk_index += 1

    return docs

