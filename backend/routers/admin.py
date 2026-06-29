"""
Admin router — login, document upload, and document listing.

All endpoints except /admin/login require a valid Bearer JWT.
Uploaded PDFs are parsed, chunked, embedded, and merged into the
existing FAISS index via the same pipeline used by build_index.py.
"""
import pathlib
import sys
import tempfile
import pickle

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File

from backend.schemas import (
    LoginRequest, LoginResponse,
    DocumentsResponse, DocumentMeta,
    UploadResponse, DeleteResponse,
    FeedbackListResponse, FeedbackItem,
)
from backend.auth import verify_password, create_token, require_admin

# Project root — two levels up from backend/routers/admin.py
PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

# Ensure indexing/ is importable (it lives at project root, not inside backend/)
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    return LoginResponse(token=create_token())


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/documents", response_model=DocumentsResponse)
async def list_documents(_: str = Depends(require_admin)):
    """
    Returns the list of unique source documents in the FAISS index.
    Reads directly from the pickled docstore inside index.pkl.
    """
    pkl_path = VECTOR_STORE_DIR / "index.pkl"
    if not pkl_path.exists():
        return DocumentsResponse(documents=[])

    try:
        with open(pkl_path, "rb") as f:
            docstore_data = pickle.load(f)

        # docstore_data is (InMemoryDocstore, index_to_docstore_id)
        # docstore._dict maps id -> Document
        docstore = docstore_data[0]
        docs = list(docstore._dict.values())

        # Aggregate unique sources and count chunks per source
        from collections import Counter
        source_counts: Counter = Counter()
        for doc in docs:
            src = doc.metadata.get("source", "Unknown")
            source_counts[src] += 1

        document_list = [
            DocumentMeta(filename=src, chunks=count)
            for src, count in sorted(source_counts.items())
        ]
        return DocumentsResponse(documents=document_list)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read index: {e}")


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    override: bool = False,
    _: str = Depends(require_admin),
):
    """
    Accepts a PDF upload, parses + chunks + embeds it, and merges it
    into the existing FAISS index (or creates a new one). Prevents exact
    duplicates and warns on same standard numbers (unless override=True).
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    try:
        from indexing.parser import parse_document
        from indexing.chunker import chunk_document
        from indexing.embedder import get_embedding_model
        from indexing.deduplicator import load_hashes, check_near_duplicate, mark_as_indexed, _normalise_key
        from langchain_community.vectorstores import FAISS
        import hashlib

        norm_name = _normalise_key(file.filename)
        file_hash = hashlib.sha256(contents).hexdigest()

        # 1. Exact duplicate check (SHA-256 content check)
        hashes = load_hashes()
        if file_hash in hashes.values():
            existing_file = next((k for k, v in hashes.items() if v == file_hash), norm_name)
            return UploadResponse(
                success=False,
                message=f"Duplicate rejected: This exact document is already indexed under the filename '{existing_file}'."
            )

        # 2. Near-duplicate standard check
        if not override:
            existing_near = check_near_duplicate(file.filename)
            if existing_near:
                existing_name = existing_near["filename"]
                std_key = existing_near["std_key"]
                return UploadResponse(
                    success=False,
                    message=(
                        f"Warning: A document referencing '{std_key}' is already indexed as "
                        f"'{existing_name}'. Indexing this as an additional document for the same standard "
                        "may create duplicate chunks and degrade retrieval quality. "
                        "If this is intentional (e.g. an amendment, errata, or different document type), "
                        "check 'Override standard warnings' and try again."
                    )
                )

        # Write to a temp file so parse_document (which expects a path) can read it
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        pages = parse_document(tmp_path)
        if not pages:
            return UploadResponse(success=False, message="Could not extract text from the PDF. It may be empty or corrupted.")

        # Override source metadata to use the normalized filename, then join text
        source_name = pathlib.Path(norm_name).name
        for page in pages:
            page["metadata"]["source"] = source_name

        # Pass pages list directly to chunk_document to preserve page-level metadata
        chunks = chunk_document(pages, source_name)
        if not chunks:
            return UploadResponse(success=False, message="Document parsed but produced no chunks.")

        # 3. Save raw PDF to data/raw/
        raw_dir = PROJECT_ROOT / "data" / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = raw_dir / norm_name
        with open(pdf_path, "wb") as f:
            f.write(contents)

        # 4. Mark as indexed in the hash registry
        mark_as_indexed(str(pdf_path))

        embeddings = get_embedding_model()
        VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
        index_file = VECTOR_STORE_DIR / "index.faiss"

        if index_file.exists():
            vectorstore = FAISS.load_local(
                str(VECTOR_STORE_DIR),
                embeddings,
                allow_dangerous_deserialization=True,
            )
            vectorstore.add_documents(chunks)
        else:
            vectorstore = FAISS.from_documents(chunks, embeddings)

        vectorstore.save_local(str(VECTOR_STORE_DIR))

        # Invalidate the retriever cache so next query picks up new docs
        from backend.rag.retriever import _load_vectorstore
        _load_vectorstore.cache_clear()

        return UploadResponse(
            success=True,
            message=f"'{file.filename}' indexed successfully ({len(chunks)} chunks added).",
        )

    except Exception as e:
        return UploadResponse(success=False, message=f"Indexing failed: {e}")

    finally:
        try:
            pathlib.Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/documents/{filename}", response_model=DeleteResponse)
async def delete_document(
    filename: str,
    _: str = Depends(require_admin),
):
    """
    Remove all chunks belonging to *filename* from the FAISS index, delete the
    entry from the hash registry, and delete the raw PDF from data/raw/.

    Because FAISS flat indices don't support per-vector deletion, the approach is:
      1. Load all Documents from index.pkl.
      2. Filter out any whose metadata['source'] matches the target filename
         (compared normalised — with .pdf extension — to handle historical no-ext entries).
      3. If no chunks were found, return 404.
      4. Rebuild a fresh FAISS index from the surviving Documents.
      5. Save back to vector_store/, clear LRU caches, clean registry, delete raw PDF.
    """
    import sys as _sys
    if str(PROJECT_ROOT) not in _sys.path:
        _sys.path.insert(0, str(PROJECT_ROOT))

    from indexing.deduplicator import _normalise_key, remove_from_registry
    from langchain_community.vectorstores import FAISS
    from langchain_huggingface import HuggingFaceEmbeddings

    # Normalise the target name so comparison is always "foo.pdf"
    target_norm = _normalise_key(filename)
    # Also prepare the stem (no ext) in case old chunks stored it that way
    target_stem = pathlib.Path(target_norm).stem

    pkl_path = VECTOR_STORE_DIR / "index.pkl"
    if not pkl_path.exists():
        raise HTTPException(status_code=404, detail="No index found.")

    try:
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
        )
        vectorstore = FAISS.load_local(
            str(VECTOR_STORE_DIR),
            embeddings,
            allow_dangerous_deserialization=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load index: {e}")

    ids_to_delete = []
    for doc_id, doc in vectorstore.docstore._dict.items():
        src = doc.metadata.get("source", "")
        if src == target_norm or src == target_stem:
            ids_to_delete.append(doc_id)

    removed_count = len(ids_to_delete)

    if removed_count == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No chunks found for '{filename}' in the index.",
        )

    try:
        if len(vectorstore.docstore._dict) == removed_count:
            # Index is now empty
            (VECTOR_STORE_DIR / "index.faiss").unlink(missing_ok=True)
            (VECTOR_STORE_DIR / "index.pkl").unlink(missing_ok=True)
        else:
            vectorstore.delete(ids_to_delete)
            vectorstore.save_local(str(VECTOR_STORE_DIR))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rebuild index: {e}")

    # Clear retriever cache so next query uses the new index
    try:
        from backend.rag.retriever import _load_vectorstore
        _load_vectorstore.cache_clear()
    except Exception:
        pass

    # Remove from hash registry
    try:
        remove_from_registry(filename)
    except Exception:
        pass  # Non-fatal — index is already clean

    # Delete raw PDF from data/raw/ (recursive search)
    raw_dir = PROJECT_ROOT / "data" / "raw"
    deleted_pdf = False
    for candidate in [target_norm, target_stem, target_stem + ".pdf"]:
        pdf_path = raw_dir / candidate
        if pdf_path.exists():
            pdf_path.unlink()
            deleted_pdf = True
            break

    detail_parts = [f"'{target_norm}' removed ({removed_count} chunks)."]
    if deleted_pdf:
        detail_parts.append("Raw PDF deleted from data/raw/.")

    return DeleteResponse(success=True, message=" ".join(detail_parts))

# ── Feedback Logs ─────────────────────────────────────────────────────────────

@router.get("/feedback", response_model=FeedbackListResponse)
async def list_feedback(_: str = Depends(require_admin)):
    import json
    log_file = PROJECT_ROOT / "data" / "feedback_log.jsonl"
    feedbacks = []
    if log_file.exists():
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        feedbacks.append(json.loads(line))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read feedback log: {e}")
            
    # Return newest first
    feedbacks.reverse()
    return FeedbackListResponse(feedbacks=feedbacks)

@router.delete("/feedback")
async def delete_feedback(timestamp: str, _: str = Depends(require_admin)):
    import json
    log_file = PROJECT_ROOT / "data" / "feedback_log.jsonl"
    if not log_file.exists():
        raise HTTPException(status_code=404, detail="Feedback log not found")
        
    kept_feedbacks = []
    deleted = False
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                item = json.loads(line_str)
                if item.get("timestamp") == timestamp:
                    deleted = True
                else:
                    kept_feedbacks.append(line)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Feedback not found")
            
        with open(log_file, "w", encoding="utf-8") as f:
            for line in kept_feedbacks:
                f.write(line)
                
        return {"success": True, "message": "Feedback deleted successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error deleting feedback: {e}")
