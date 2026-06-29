"""
update_index.py — Incrementally add a new PDF to the FAISS index.

Usage
-----
# Auto-detect category from filename/content:
python -m indexing.update_index path/to/doc.pdf

# Override category:
python -m indexing.update_index path/to/doc.pdf --category delegation

# List all indexed documents:
python -m indexing.update_index --list

Valid categories:
    safety_regulation | regulatory | delegation | hr | procurement | equipment | general

Notes
-----
• Documents are deduplicated by MD5 hash — re-running on the same PDF is safe.
• After running this script, restart Uvicorn so the server loads the updated index.
  (The in-memory FAISS instance loaded at startup won't see new chunks otherwise.)
"""

# Shim pkgutil.find_loader for Python 3.14+ compatibility (used by pytesseract)
import pkgutil
import importlib.util
if not hasattr(pkgutil, "find_loader"):
    def _find_loader(fullname):
        try:
            spec = importlib.util.find_spec(fullname)
            return spec.loader if spec is not None else None
        except Exception:
            return None
    pkgutil.find_loader = _find_loader

import argparse
import hashlib
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

VECTOR_STORE_DIR = "vector_store"
REGISTRY_PATH = "document_registry.json"

VALID_CATEGORIES = {
    "safety_regulation", "regulatory", "delegation",
    "hr", "procurement", "equipment", "general",
}


# ─────────────────────────────────────────────────────────────────────────────
# Registry helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_registry() -> dict:
    p = Path(REGISTRY_PATH)
    if p.exists():
        with p.open() as f:
            return json.load(f)
    return {"documents": [], "total_chunks": 0}


def _save_registry(registry: dict) -> None:
    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=2, default=str)


def _md5(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def _already_indexed(registry: dict, md5: str) -> bool:
    return any(doc["md5"] == md5 for doc in registry["documents"])


# ─────────────────────────────────────────────────────────────────────────────
# Main indexing routine
# ─────────────────────────────────────────────────────────────────────────────

def update_index(pdf_path: str, category: str | None = None, force: bool = False) -> None:
    from langchain_community.vectorstores import FAISS

    from indexing.chunker import chunk_document, detect_category
    from indexing.deduplicator import check_near_duplicate
    from indexing.embedder import get_embedding_model
    from indexing.parser import parse_document

    path = Path(pdf_path).resolve()
    if not path.exists():
        log.error(f"❌  File not found: {path}")
        sys.exit(1)

    registry = _load_registry()
    file_md5 = _md5(str(path))

    if _already_indexed(registry, file_md5):
        log.info(f"⚠️   Already indexed (MD5 match): {path.name} — skipping.")
        return

    # —— Near-duplicate check (same standard, different file) ——
    near_dup = check_near_duplicate(path.name)
    if near_dup and not force:
        log.warning("")
        log.warning("⚠️  NEAR-DUPLICATE WARNING")
        log.warning(f"   A document referencing '{near_dup['std_key']}' is already indexed:")
        log.warning(f"   Existing: {near_dup['filename']}")
        log.warning(f"   New:      {path.name}")
        log.warning("")
        log.warning("   Indexing this as an ADDITIONAL document for the same standard may create")
        log.warning("   duplicate chunks in the vector store, degrading retrieval quality.")
        log.warning("")
        log.warning("   Only proceed if this is an amendment, errata, or a different document")
        log.warning("   type (e.g., SOP vs. the standard itself, or an FAQ supplement).")
        log.warning("")
        log.warning("   To proceed anyway: re-run with --force")
        log.warning("   To cancel:         press Ctrl+C or do not add --force")
        log.warning("")
        sys.exit(0)
    elif near_dup and force:
        log.warning(f"⚠️  Near-duplicate detected ('{near_dup['std_key']}') but --force passed — proceeding.")

    # ── Parse ──
    log.info(f"📄  Parsing: {path.name}")
    pages = parse_document(str(path))
    text = "\n\n".join(p["text"] for p in pages)
    if not text.strip():
        log.error("❌  No text extracted. Is the PDF scanned? Run OCR first.")
        sys.exit(1)

    # ── Detect / validate category ──
    if category is None:
        category = detect_category(path.name, text)
        log.info(f"🏷️   Auto-detected category: {category}")
    else:
        if category not in VALID_CATEGORIES:
            log.error(f"❌  Unknown category '{category}'. Valid: {sorted(VALID_CATEGORIES)}")
            sys.exit(1)
        log.info(f"🏷️   Category (override): {category}")

    # ── Chunk ──
    log.info("✂️   Chunking …")
    docs = chunk_document(pages, str(path), category=category)
    log.info(f"     → {len(docs)} chunks")

    # ── Embed & merge into FAISS ──
    log.info("🔢  Embedding …")
    embeddings = get_embedding_model()

    store_path = Path(VECTOR_STORE_DIR)
    if store_path.exists():
        vs = FAISS.load_local(
            VECTOR_STORE_DIR, embeddings, allow_dangerous_deserialization=True
        )
        vs.add_documents(docs)
        log.info("     → Merged into existing index")
    else:
        vs = FAISS.from_documents(docs, embeddings)
        log.info("     → Created new index")

    vs.save_local(VECTOR_STORE_DIR)
    log.info(f"     ✓ Index saved → {VECTOR_STORE_DIR}/")

    # ── Update registry ──
    registry["documents"].append({
        "filename": path.name,
        "path": str(path),
        "md5": file_md5,
        "category": category,
        "chunks": len(docs),
        "indexed_at": datetime.now(timezone.utc).isoformat(),
    })
    registry["total_chunks"] = sum(d["chunks"] for d in registry["documents"])
    _save_registry(registry)

    log.info(
        f"     ✓ Registry updated — "
        f"{len(registry['documents'])} documents, "
        f"{registry['total_chunks']} total chunks"
    )
    log.info("")
    log.info("⚡  Restart Uvicorn to load the updated index into memory.")


# ─────────────────────────────────────────────────────────────────────────────
# --list command
# ─────────────────────────────────────────────────────────────────────────────

def list_documents() -> None:
    registry = _load_registry()
    docs = registry.get("documents", [])
    if not docs:
        log.info("No documents indexed yet.")
        return

    log.info(f"{'Filename':<45} {'Category':<22} {'Chunks':>6}  {'Indexed at'}")
    log.info("─" * 100)
    for d in docs:
        log.info(
            f"{d['filename']:<45} {d['category']:<22} {d['chunks']:>6}  {d['indexed_at'][:19]}"
        )
    log.info("─" * 100)
    log.info(f"Total: {len(docs)} documents, {registry.get('total_chunks', '?')} chunks")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Add a PDF to the PolicyIQ FAISS index."
    )
    parser.add_argument(
        "pdf_path",
        nargs="?",
        help="Path to the PDF file to index.",
    )
    parser.add_argument(
        "--category",
        default=None,
        help=(
            "Override auto-detected category. "
            f"One of: {', '.join(sorted(VALID_CATEGORIES))}"
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Bypass the near-duplicate warning and index anyway. Use when uploading "
            "an intentional addition (errata, amendment, FAQ) for a standard that "
            "already has a document indexed."
        ),
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all indexed documents and exit.",
    )
    args = parser.parse_args()

    if args.list:
        list_documents()
    elif args.pdf_path:
        update_index(args.pdf_path, args.category, force=getattr(args, 'force', False))
    else:
        parser.print_help()
        sys.exit(1)
