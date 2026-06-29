"""
find_duplicates.py — PolicyIQ Duplicate Document Analysis

Scans data/raw/ for all PDFs, groups them by a normalized "standard identifier"
extracted from filenames, compares file sizes, page counts, content snippets,
and cross-references both registries (indexed_hashes.json and document_registry.json)
to report what's actually indexed vs what's a duplicate.

Usage:
    python scripts/find_duplicates.py
"""

import hashlib
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
ARCHIVE_DIR = PROJECT_ROOT / "data" / "archive"
HASHES_FILE = PROJECT_ROOT / "data" / "indexed_hashes.json"
REGISTRY_FILE = PROJECT_ROOT / "document_registry.json"

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    print("[WARNING] pdfplumber not available — page counts will show as N/A")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_sha256(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(4096), b""):
            sha256.update(block)
    return sha256.hexdigest()


def get_page_count_and_snippet(file_path: Path) -> tuple[int, str]:
    if not HAS_PDFPLUMBER:
        return -1, ""
    try:
        with pdfplumber.open(file_path) as pdf:
            pages = len(pdf.pages)
            text = ""
            for i in range(min(2, pages)):
                text += pdf.pages[i].extract_text() or ""
            return pages, text[:500].replace("\n", " ")
    except Exception as e:
        return -1, f"[ERROR: {e}]"


# Standard identifier extraction — handles all naming variants
_STD_PATTERNS = [
    # OISD-STD-144, OISD_STD_144, OISD-144
    (r"oisd[-_]?(?:std|gdn|standard)?[-_]?(\d+)", lambda m: f"OISD-{m.group(1)}"),
    # PNGRB patterns
    (r"pngrb[-_]?(?:std|regulations|rules)?[-_]?(\d+)", lambda m: f"PNGRB-{m.group(1)}"),
    # PESO named rules (no number) — match by keyword grouping
    (r"peso.*gas[-_]cylinders[-_]rules", lambda m: "PESO-Gas_Cylinders_Rules"),
    (r"peso.*petroleum[-_]rules[-_]?(\d{4})?", lambda m: f"PESO-Petroleum_Rules_{m.group(1) or '2002'}"),
    (r"peso.*explosives[-_]rules[-_]?(\d{4})?", lambda m: f"PESO-Explosives_Rules_{m.group(1) or '2008'}"),
    (r"peso.*smpv[-_]?(?:unfired)?[-_]rules[-_]?(\d{4})?", lambda m: f"PESO-SMPV_Rules_{m.group(1) or '2016'}"),
    (r"peso.*ammonium[-_]nitrate", lambda m: "PESO-Ammonium_Nitrate_Rules"),
    (r"peso.*annual[-_]report[-_]?(\d{4})?", lambda m: f"PESO-Annual_Report_{m.group(1) or 'unknown'}"),
    # Generic PESO numeric
    (r"peso[-_]?(?:std|gdn)?[-_]?(\d+)", lambda m: f"PESO-{m.group(1)}"),
]


def get_standard_id(filename: str) -> str:
    fn = filename.lower()
    for pattern, formatter in _STD_PATTERNS:
        m = re.search(pattern, fn)
        if m:
            return formatter(m)
    return f"UNKNOWN ({filename})"


def load_hashes_registry() -> dict:
    if HASHES_FILE.exists():
        with open(HASHES_FILE) as f:
            return json.load(f)
    return {}


def load_document_registry() -> dict:
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    return {"documents": []}


# ---------------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------------

def main():
    all_files = sorted(RAW_DIR.glob("*.pdf"))
    if not all_files:
        print(f"No PDFs found in {RAW_DIR}")
        sys.exit(0)

    hashes_reg = load_hashes_registry()
    doc_reg = load_document_registry()
    doc_reg_names = {d["filename"] for d in doc_reg.get("documents", [])}

    print(f"\n{'='*70}")
    print(f" PolicyIQ Duplicate Document Analysis")
    print(f" Scanning {len(all_files)} PDFs in data/raw/")
    print(f"{'='*70}\n")

    # Build info table
    records = []
    for f in all_files:
        sha = compute_sha256(f)
        pages, snippet = get_page_count_and_snippet(f)
        std_id = get_standard_id(f.name)
        in_hashes = f.name in hashes_reg
        in_doc_reg = f.name in doc_reg_names
        records.append({
            "filename": f.name,
            "path": f,
            "size": f.stat().st_size,
            "pages": pages,
            "sha256": sha,
            "std_id": std_id,
            "in_hashes_json": in_hashes,
            "in_doc_registry": in_doc_reg,
            "snippet": snippet,
        })

    # Group by standard identifier
    groups: dict[str, list] = {}
    for r in records:
        groups.setdefault(r["std_id"], []).append(r)

    duplicates_found = 0
    clean_groups = 0

    for std_id, members in sorted(groups.items()):
        if len(members) == 1:
            clean_groups += 1
            continue

        # Multiple files for same standard — potential duplicate
        duplicates_found += 1
        hashes = [m["sha256"] for m in members]
        all_same_hash = len(set(hashes)) == 1

        print(f"{'─'*70}")
        print(f"  GROUP: {std_id}  ({'IDENTICAL CONTENT' if all_same_hash else 'DIFFERENT CONTENT'})")
        print(f"  Files: {len(members)}")
        print()
        for m in members:
            idx_status = []
            if m["in_hashes_json"]:
                idx_status.append("indexed_hashes.json ✓")
            if m["in_doc_registry"]:
                idx_status.append("document_registry.json ✓")
            if not idx_status:
                idx_status = ["NOT IN ANY REGISTRY ⚠"]
            print(f"  📄 {m['filename']}")
            print(f"     Size:    {m['size']:,} bytes")
            print(f"     Pages:   {m['pages'] if m['pages'] >= 0 else 'N/A'}")
            print(f"     SHA-256: {m['sha256'][:16]}...")
            print(f"     Indexed: {', '.join(idx_status)}")
            if m["snippet"]:
                print(f"     Snippet: {m['snippet'][:120]}...")
            print()

        # Recommend canonical version
        if all_same_hash:
            # Identical — prefer lower-numbered (earlier) original
            keeper = sorted(members, key=lambda x: x["filename"])[0]
            others = [m for m in members if m["filename"] != keeper["filename"]]
            print(f"  ✅ RECOMMENDATION: Keep '{keeper['filename']}' (lowest number prefix)")
            for o in others:
                print(f"  ❌ ARCHIVE: '{o['filename']}' (identical content)")
        else:
            # Different content — prefer larger file (more pages)
            keeper = sorted(members, key=lambda x: (x["pages"], x["size"]), reverse=True)[0]
            others = [m for m in members if m["filename"] != keeper["filename"]]
            print(f"  ✅ RECOMMENDATION: Keep '{keeper['filename']}' (most pages/largest)")
            for o in others:
                print(f"  ⚠️  REVIEW: '{o['filename']}' — different content, may be errata/amendment")
        print()

    print(f"{'='*70}")
    print(f" SUMMARY")
    print(f"{'='*70}")
    print(f"  Total PDFs scanned:      {len(all_files)}")
    print(f"  Clean groups (1 file):   {clean_groups}")
    print(f"  Duplicate groups found:  {duplicates_found}")
    print(f"  Registries checked:")
    print(f"    indexed_hashes.json:   {len(hashes_reg)} entries")
    print(f"    document_registry.json:{len(doc_reg.get('documents', []))} entries")
    print()

    # Also check for files in raw that are NOT in either registry (orphaned)
    indexed_names = set(hashes_reg.keys()) | doc_reg_names
    orphaned = [r["filename"] for r in records if r["filename"] not in indexed_names]
    if orphaned:
        print(f"  ⚠️  Files in raw/ but NOT indexed in either registry ({len(orphaned)}):")
        for o in orphaned:
            print(f"       {o}")
    else:
        print(f"  ✓ All files in raw/ are referenced in at least one registry")
    print()


if __name__ == "__main__":
    main()
