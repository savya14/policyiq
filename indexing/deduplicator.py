"""
Deduplicator module for PolicyIQ.

This module provides a file-based registry mechanism to track and deduplicate documents 
indexed in the system. When a document is indexed, its SHA-256 hash is computed and stored 
in a JSON registry (`data/indexed_hashes.json`) alongside its filename.

Deduplication Strategy:
1. Content-based tracking: SHA-256 hash of file bytes identifies duplicates even across renames.
2. Index integrity: before embedding a document the registry is queried; if its hash is already
   present, ingestion is skipped — no duplicate vectors enter FAISS.
3. Key normalisation: registry keys are ALWAYS the full filename including the .pdf extension
   (e.g. "04_OISD-STD-105_Work_Permit_CaseStudies.pdf"). This prevents the historical bug where
   an early indexing run stored chunks under path.stem (no extension) producing two separate
   source entries in the FAISS docstore for the same physical file.
4. Vector deletion limitation: FAISS flat indices do not support in-place deletion. Removing a
   document requires filtering the docstore and rebuilding the index from scratch.
"""

import hashlib
import json
import pathlib
import os

# Define paths relative to the project root for robustness
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
HASHES_FILE = str(PROJECT_ROOT / "data" / "indexed_hashes.json")

def _ensure_data_dir() -> None:
    """Ensures the parent directory for HASHES_FILE exists."""
    pathlib.Path(HASHES_FILE).parent.mkdir(parents=True, exist_ok=True)

def compute_sha256(file_path: str) -> str:
    """
    Computes the SHA-256 checksum of a file by reading it in binary mode blocks.
    """
    path = pathlib.Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found for hash computation: {file_path}")

    sha256_hash = hashlib.sha256()
    with open(path, "rb") as f:
        # Read in 4KB blocks to prevent high memory consumption on large PDFs
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def load_hashes() -> dict:
    """
    Loads the indexed hashes registry from the JSON file.
    Returns a dictionary mapping filename -> SHA-256 hash.
    Returns an empty dictionary if the file does not exist.
    """
    _ensure_data_dir()
    hashes_path = pathlib.Path(HASHES_FILE)
    if not hashes_path.exists():
        return {}
    
    try:
        with open(hashes_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
            return {}
    except (json.JSONDecodeError, IOError):
        # Fallback to an empty registry if the file is corrupted or unreadable
        return {}

def save_hashes(hashes: dict) -> None:
    """
    Writes the hashes registry to the JSON file with pretty printing.
    """
    _ensure_data_dir()
    hashes_path = pathlib.Path(HASHES_FILE)
    with open(hashes_path, "w", encoding="utf-8") as f:
        json.dump(hashes, f, indent=2)

import re
from typing import Optional

# Ordered patterns: first match wins.
# Each tuple is (regex, formatter_fn) where formatter_fn takes the re.Match object.
_STD_ID_PATTERNS = [
    # OISD numbered standards: OISD-STD-144, OISD_STD_144, OISD-144
    (r"oisd[-_]?(?:std|gdn|standard)?[-_]?(\d+)", lambda m: f"OISD-{m.group(1)}"),
    # PNGRB numbered standards
    (r"pngrb[-_]?(?:std|regulations|rules|t4s|ngpl)?[-_]?(\d+)", lambda m: f"PNGRB-{m.group(1)}"),
    # PESO named rules (no standard number — match by keyword)
    (r"peso.*gas[-_]cylinders[-_]rules", lambda m: "PESO-Gas_Cylinders_Rules"),
    (r"peso.*smpv[-_]?(?:unfired)?[-_]rules", lambda m: "PESO-SMPV_Rules"),
    (r"peso.*ammonium[-_]nitrate", lambda m: "PESO-Ammonium_Nitrate_Rules"),
    (r"peso.*explosives[-_]rules[-_]?(\d{4})?", lambda m: f"PESO-Explosives_Rules_{m.group(1) or '2008'}"),
    (r"peso.*petroleum[-_]rules[-_]?(\d{4})?", lambda m: f"PESO-Petroleum_Rules_{m.group(1) or '2002'}"),
    (r"peso.*annual[-_]report[-_]?(\d{4}-?\d{2})?", lambda m: f"PESO-Annual_Report_{m.group(1) or 'unknown'}"),
    # Generic PESO with a number
    (r"peso[-_]?(?:std|gdn)?[-_]?(\d+)", lambda m: f"PESO-{m.group(1)}"),
]


def get_standard_key(filename: str) -> Optional[str]:
    """Extract a normalized standard grouping key from a filename.

    Handles both numbered standards (OISD-144, PNGRB-456) and PESO named-rule
    documents (Gas_Cylinders_Rules, Petroleum_Rules_2002, etc.).

    Returns None if no recognizable standard pattern is found.
    """
    fn = filename.lower()
    for pattern, formatter in _STD_ID_PATTERNS:
        m = re.search(pattern, fn)
        if m:
            return formatter(m)
    return None


def check_near_duplicate(filename: str) -> Optional[dict]:
    """Check if a document referencing the same standard already exists in the registry.

    Returns a dict with {"filename": str, "std_key": str} if a near-duplicate is found,
    otherwise None.  The caller should warn the user and ask for confirmation.
    """
    new_key = get_standard_key(filename)
    if not new_key:
        return None

    hashes = load_hashes()
    for existing_name in hashes.keys():
        existing_key = get_standard_key(existing_name)
        if existing_key and existing_key == new_key and existing_name != filename:
            return {"filename": existing_name, "std_key": new_key}
    return None

def is_already_indexed(file_path: str) -> bool:
    """
    Checks if a file's content hash is already registered in the registry.
    Returns True if the content is already indexed.
    """
    if not pathlib.Path(file_path).exists():
        return False
    file_hash = compute_sha256(file_path)
    hashes = load_hashes()
    return file_hash in hashes.values()

def _normalise_key(file_path: str) -> str:
    """
    Returns a normalised registry key: always the full filename with extension.
    Accepts a bare stem like "04_OISD-STD-105_Work_Permit_CaseStudies" and ensures
    it becomes "04_OISD-STD-105_Work_Permit_CaseStudies.pdf".
    """
    name = pathlib.Path(file_path).name
    if not name.lower().endswith(".pdf"):
        name = name + ".pdf"
    return name


def mark_as_indexed(file_path: str) -> None:
    """
    Computes the file's hash, registers it under the normalised filename, and saves the registry.
    """
    key = _normalise_key(file_path)
    file_hash = compute_sha256(str(pathlib.Path(file_path)))
    hashes = load_hashes()
    hashes[key] = file_hash
    save_hashes(hashes)


def remove_from_registry(filename: str) -> None:
    """
    Removes a document's normalised filename entry from the hash registry.
    This does NOT modify the FAISS index — call the delete endpoint or rebuild_index
    to remove the vectors.
    """
    key = _normalise_key(filename)
    hashes = load_hashes()
    removed = hashes.pop(key, None)
    if removed:
        save_hashes(hashes)

def remove_from_index(file_path: str) -> None:
    """
    Alias kept for backwards compatibility. Delegates to remove_from_registry.
    """
    remove_from_registry(file_path)

if __name__ == "__main__":
    # Self-testing code
    _ensure_data_dir()
    print(f"Registry location resolved to: {HASHES_FILE}")
    
    # Check loading on non-existent or existing file
    loaded = load_hashes()
    print(f"Current registry state: {loaded}")
    
    # Create a temporary dummy file to test hashing and registry operations
    temp_file = pathlib.Path(HASHES_FILE).parent / "test_dedup.txt"
    try:
        temp_file.write_text("Hello PolicyIQ Deduplicator!", encoding="utf-8")
        
        print("\n--- Testing Deduplicator Flow ---")
        is_indexed_before = is_already_indexed(str(temp_file))
        print(f"Is temporary file already indexed? {is_indexed_before}")
        
        print("Registering temporary file...")
        mark_as_indexed(str(temp_file))
        
        is_indexed_after = is_already_indexed(str(temp_file))
        print(f"Is temporary file indexed after registration? {is_indexed_after}")
        print(f"Updated registry: {load_hashes()}")
        
        print("Deregistering temporary file...")
        remove_from_index(str(temp_file))
        print(f"Registry after removal: {load_hashes()}")
        
    finally:
        if temp_file.exists():
            temp_file.unlink()
