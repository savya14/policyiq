"""
dedupe_cleanup.py — PolicyIQ Duplicate Corpus Cleanup

Removes confirmed identical duplicate PDFs from data/raw/, moves them to
data/archive/, removes their entries from BOTH registries (indexed_hashes.json
and document_registry.json), then rebuilds the FAISS index from scratch.

Also indexes any orphaned files (in raw but not in any registry).

Usage:
    python scripts/dedupe_cleanup.py [--dry-run]

Options:
    --dry-run   Show what would happen without making any changes.
"""

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
ARCHIVE_DIR = PROJECT_ROOT / "data" / "archive"
HASHES_FILE = PROJECT_ROOT / "data" / "indexed_hashes.json"
REGISTRY_FILE = PROJECT_ROOT / "document_registry.json"
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

# ---------------------------------------------------------------------------
# Confirmed identical duplicate pairs (from find_duplicates.py analysis).
# Maps: <duplicate to archive> -> <canonical to keep>
# These are byte-for-byte identical files confirmed by SHA-256 match.
# ---------------------------------------------------------------------------
CONFIRMED_DUPLICATES = {
    "35_PESO_Gas_Cylinders_Rules_SOP.pdf":   "11_PESO_Gas_Cylinders_Rules_SOP.pdf",
    "32_PESO_Petroleum_Rules_2002_SOP.pdf":  "13_PESO_Petroleum_Rules_2002_SOP.pdf",
    "36_PESO_Explosives_Rules_2008_SOP.pdf": "15_PESO_Explosives_Rules_2008_SOP.pdf",
}


# ---------------------------------------------------------------------------
# Registry helpers
# ---------------------------------------------------------------------------

def compute_sha256(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(4096), b""):
            sha256.update(block)
    return sha256.hexdigest()


def load_hashes_registry() -> dict:
    if HASHES_FILE.exists():
        with open(HASHES_FILE) as f:
            return json.load(f)
    return {}


def save_hashes_registry(data: dict) -> None:
    with open(HASHES_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_doc_registry() -> dict:
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    return {"documents": [], "total_chunks": 0}


def save_doc_registry(data: dict) -> None:
    with open(REGISTRY_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Verification: confirm duplicates are truly identical before archiving
# ---------------------------------------------------------------------------

def verify_identical(dup_name: str, canonical_name: str) -> bool:
    dup_path = RAW_DIR / dup_name
    canonical_path = RAW_DIR / canonical_name
    if not dup_path.exists():
        print(f"  [SKIP] Duplicate not found in raw/: {dup_name}")
        return False
    if not canonical_path.exists():
        print(f"  [WARN] Canonical not found in raw/: {canonical_name} — skipping pair")
        return False
    dup_sha = compute_sha256(dup_path)
    can_sha = compute_sha256(canonical_path)
    if dup_sha != can_sha:
        print(f"  [WARN] SHA-256 mismatch! {dup_name} != {canonical_name}")
        print(f"         Dup:       {dup_sha[:16]}...")
        print(f"         Canonical: {can_sha[:16]}...")
        print(f"         These are NOT identical — skipping this pair for safety.")
        return False
    return True


# ---------------------------------------------------------------------------
# Main cleanup
# ---------------------------------------------------------------------------

def run_cleanup(dry_run: bool = False) -> None:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    mode_label = "[DRY RUN] " if dry_run else ""

    print(f"\n{'='*70}")
    print(f" {mode_label}PolicyIQ Duplicate Cleanup")
    print(f"{'='*70}\n")

    # Load current registries
    hashes_reg = load_hashes_registry()
    doc_reg = load_doc_registry()
    doc_reg_docs = doc_reg.get("documents", [])

    archived_files = []
    hashes_removed = []
    doc_reg_removed = []
    chunks_removed = 0

    # Step 1: Verify and archive confirmed duplicates
    print("Step 1: Verifying and archiving confirmed identical duplicates")
    print("-" * 60)

    for dup_name, canonical_name in CONFIRMED_DUPLICATES.items():
        dup_path = RAW_DIR / dup_name
        if not dup_path.exists():
            # May already be archived from a prior run
            archive_path = ARCHIVE_DIR / dup_name
            if archive_path.exists():
                print(f"  [ALREADY ARCHIVED] {dup_name}")
            else:
                print(f"  [NOT FOUND] {dup_name} — not in raw/ or archive/, skipping")
            continue

        print(f"\n  Pair: {dup_name} → ARCHIVE")
        print(f"        {canonical_name} → KEEP")

        # Verify identical before archiving
        if not verify_identical(dup_name, canonical_name):
            continue

        dest = ARCHIVE_DIR / dup_name
        if not dry_run:
            shutil.move(str(dup_path), str(dest))
            print(f"  ✓ Moved {dup_name} → data/archive/")
        else:
            print(f"  [DRY] Would move {dup_name} → data/archive/")

        archived_files.append(dup_name)

        # Remove from indexed_hashes.json if present
        if dup_name in hashes_reg:
            del hashes_reg[dup_name]
            hashes_removed.append(dup_name)
            print(f"  ✓ Removed from indexed_hashes.json")

        # Remove from document_registry.json if present
        before_count = len(doc_reg_docs)
        dup_doc = None
        for d in doc_reg_docs:
            if d["filename"] == dup_name:
                dup_doc = d
                break
        if dup_doc:
            chunks_removed += dup_doc.get("chunks", 0)
            doc_reg_docs = [d for d in doc_reg_docs if d["filename"] != dup_name]
            doc_reg_removed.append(dup_name)
            print(f"  ✓ Removed from document_registry.json ({dup_doc.get('chunks', 0)} chunks)")

    # Step 2: Save updated registries
    print(f"\nStep 2: Saving updated registries")
    print("-" * 60)
    if not dry_run:
        save_hashes_registry(hashes_reg)
        print(f"  ✓ indexed_hashes.json: {len(hashes_reg)} entries")

        doc_reg["documents"] = doc_reg_docs
        doc_reg["total_chunks"] = sum(d.get("chunks", 0) for d in doc_reg_docs)
        save_doc_registry(doc_reg)
        print(f"  ✓ document_registry.json: {len(doc_reg_docs)} entries, {doc_reg['total_chunks']} chunks")
    else:
        print(f"  [DRY] Would update both registries")

    # Step 3: Clear old FAISS index to force rebuild
    print(f"\nStep 3: Clearing old FAISS index for rebuild")
    print("-" * 60)
    index_faiss = VECTOR_STORE_DIR / "index.faiss"
    index_pkl = VECTOR_STORE_DIR / "index.pkl"

    if archived_files:
        for f in [index_faiss, index_pkl]:
            if f.exists():
                if not dry_run:
                    f.unlink()
                    print(f"  ✓ Deleted {f.name}")
                else:
                    print(f"  [DRY] Would delete {f.name}")
        # Also clear indexed_hashes.json to force full rebuild
        # (FAISS flat index doesn't support partial deletion)
        if not dry_run:
            save_hashes_registry({})
            print(f"  ✓ Cleared indexed_hashes.json to force full rebuild")
        else:
            print(f"  [DRY] Would clear indexed_hashes.json for rebuild")
    else:
        print(f"  No files archived — index rebuild not needed")

    # Step 4: Rebuild FAISS index
    print(f"\nStep 4: Rebuilding FAISS index from clean corpus")
    print("-" * 60)

    if not archived_files and not dry_run:
        print(f"  No changes made — index is already clean")
    elif not dry_run:
        try:
            # Add project root to sys.path for imports
            import sys
            if str(PROJECT_ROOT) not in sys.path:
                sys.path.insert(0, str(PROJECT_ROOT))

            # Load .env for API keys
            try:
                from dotenv import load_dotenv
                load_dotenv(PROJECT_ROOT / ".env")
            except ImportError:
                pass

            from indexing.build_index import main as build_main
            print(f"  Running build_index.py on {RAW_DIR}...")
            build_main()
            print(f"  ✓ Index rebuilt successfully")
        except Exception as e:
            print(f"  ✗ Rebuild failed: {e}", file=sys.stderr)
            print(f"    Run manually: python -m indexing.build_index", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"  [DRY] Would rebuild FAISS index from {RAW_DIR}")

    # Step 5: Sync document_registry.json with newly rebuilt indexed_hashes.json
    if not dry_run and archived_files:
        print(f"\nStep 5: Syncing document_registry.json with rebuilt index")
        print("-" * 60)
        new_hashes = load_hashes_registry()
        current_doc_reg = load_doc_registry()
        # Remove any doc_registry entries that are no longer in raw/
        current_docs = current_doc_reg.get("documents", [])
        synced_docs = [d for d in current_docs if d["filename"] in new_hashes]
        removed_from_doc_reg = len(current_docs) - len(synced_docs)
        current_doc_reg["documents"] = synced_docs
        current_doc_reg["total_chunks"] = sum(d.get("chunks", 0) for d in synced_docs)
        save_doc_registry(current_doc_reg)
        print(f"  ✓ document_registry.json synced: {len(synced_docs)} entries ({removed_from_doc_reg} removed)")

    # Summary
    print(f"\n{'='*70}")
    print(f" {mode_label}CLEANUP SUMMARY")
    print(f"{'='*70}")
    print(f"  Files archived:        {len(archived_files)}")
    if archived_files:
        for f in archived_files:
            print(f"    - {f}")
    print(f"  Removed from hashes:   {len(hashes_removed)}")
    print(f"  Removed from doc_reg:  {len(doc_reg_removed)}")
    print(f"  Chunks removed (est):  {chunks_removed}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Archive confirmed duplicate PDFs and rebuild the FAISS index."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making any changes.",
    )
    args = parser.parse_args()
    run_cleanup(dry_run=args.dry_run)
