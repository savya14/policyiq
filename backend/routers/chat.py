import os
import re
import uuid
import unicodedata
from fastapi import APIRouter, HTTPException, Request
from groq import Groq

from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.rag.pipeline import ask
from backend.schemas import AskRequest, AskResponse, FeedbackRequest, FeedbackResponse, DocumentsResponse, DocumentMeta
import json
import pickle
import pathlib
from datetime import datetime

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Project root
PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

# Initialize Groq client with the API key from environment variable
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def is_prompt_safe(user_query: str) -> tuple[bool, str]:
    """
    Runs user query through Prompt Guard classifier.
    Returns (is_safe: bool, label: str)
    Fails OPEN — if guard errors, allow query through.
    """
    try:
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-prompt-guard-2-86m",
            messages=[
                {"role": "user", "content": user_query}
            ],
        )
        result = response.choices[0].message.content.strip().upper()

        if "INJECTION" in result or "JAILBREAK" in result:
            return False, result

        # Check for numeric float probability output (e.g. '0.9995') returned by Groq Prompt Guard
        try:
            score = float(result)
            if score > 0.5:
                return False, f"INJECTION (SCORE: {score})"
        except ValueError:
            pass

        return True, "SAFE"

    except Exception as e:
        # Do not block user if guard fails
        print(f"[PromptGuard] Check failed: {e}")
        return True, "GUARD_FAILED"


@router.post("/ask", response_model=AskResponse)
@limiter.limit("20/minute")
async def ask_endpoint(request: Request, payload: AskRequest) -> AskResponse:
    """
    Ask a policy question. Supports conversation memory via session_id.

    - Pass the `session_id` returned by the first response to continue a conversation.
    - Omit `session_id` (or send null) to start a fresh session.
    - Follow-up questions like "what about clause 4?" or "what's the limit for grade B?"
      are automatically rewritten into standalone queries before retrieval.
    """
    user_query = payload.question
    print(f"--- RECEIVED ASK REQUEST: language='{payload.language}', question='{user_query}' ---")

    # --- NEW: GUARD CHECK ---
    is_safe, label = is_prompt_safe(user_query)
    if not is_safe:
        # Generate session_id if missing to maintain conversation schema validity
        session_id = payload.session_id or str(uuid.uuid4())
        return AskResponse(
            answer=None,
            session_id=session_id,
            source_documents=[],
            is_in_scope=True,
            rate_limited=False,
            blocked=True,
            block_reason=(
                "Your query was flagged as a potential "
                "prompt injection attempt. Please ask a "
                "genuine compliance question."
            )
        )

    # --- EXISTING: RAG PIPELINE ---
    try:
        result = ask(
            question=user_query, 
            session_id=payload.session_id, 
            chat_history=payload.chat_history, 
            language=payload.language
        )
        # Ensure default blocked/block_reason are populated
        result["blocked"] = False
        result["block_reason"] = ""
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return AskResponse(**result)

@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(request: FeedbackRequest) -> FeedbackResponse:
    """
    Log user feedback for continuous improvement of retrieval parameters and corpus quality.
    Note: This is an append-only log for manual curation, NOT an automatic self-improving pipeline.
    """
    log_file = "data/feedback_log.jsonl"
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "query": request.query,
        "response": request.response,
        "sources": request.sources,
        "is_positive": request.is_positive
    }
    
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        return FeedbackResponse(success=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log feedback: {exc}")

@router.get("/documents", response_model=DocumentsResponse)
async def list_documents():
    """
    Returns the list of all PDF documents in the raw and archive folders,
    combined with chunk counts from the FAISS index.
    Public endpoint for the chat interface sidebar.
    """
    from collections import Counter
    source_counts = Counter()
    
    pkl_path = VECTOR_STORE_DIR / "index.pkl"
    if pkl_path.exists():
        try:
            with open(pkl_path, "rb") as f:
                docstore_data = pickle.load(f)
            docstore = docstore_data[0]
            for doc in docstore._dict.values():
                src = doc.metadata.get("source", "Unknown")
                source_counts[src] += 1
        except Exception as e:
            print(f"Warning: Failed to read index.pkl: {e}")

    # Get canonical list of physical PDFs on disk
    pdf_files = set()
    raw_dir = PROJECT_ROOT / "data" / "raw"
    archive_dir = PROJECT_ROOT / "data" / "archive"
    
    for folder in [raw_dir, archive_dir]:
        if folder.exists():
            for p in folder.glob("*.pdf"):
                pdf_files.add(p.name)
                
    # Map chunk counts to physical files robustly
    import re
    def normalize(name):
        return re.sub(r'^(\d+_)+', '', name)

    document_list = []
    for disk_file in sorted(pdf_files):
        norm_disk = normalize(disk_file)
        chunks = 0
        for src, count in source_counts.items():
            if normalize(src) == norm_disk:
                chunks = count
                break
        document_list.append(DocumentMeta(filename=disk_file, chunks=chunks))

    return DocumentsResponse(documents=document_list)

@router.post("/translate")
async def translate_answer(request: Request):
    import json as _json
    body = await request.json()
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise translator. Translate the given English compliance text to Hindi (Devanagari script). "
                    "Keep all technical terms, standard names (OISD, PESO, PNGRB), clause numbers, document names, "
                    "measurement units, and citations like [OISD-STD-144, Page 25] in English. "
                    "Translate only the explanatory text to Hindi. Return only the translated text, nothing else."
                )
            },
            {"role": "user", "content": text}
        ],
    )
    translated = response.choices[0].message.content.strip()

    # ── Fix Unicode garbling at English↔Hindi word boundaries ────────────
    # 1. NFC-normalize: compose decomposed Devanagari codepoints (NFD → NFC)
    #    so that base char + combining vowel sign become single precomposed chars.
    translated = unicodedata.normalize("NFC", translated)

    # 2. Strip orphaned combining marks (U+0300-U+036F, U+0900-U+0954)
    #    that got stuck between Latin characters and Devanagari text.
    #    Pattern: a Latin char followed by combining marks followed by Devanagari —
    #    remove the combining marks to prevent garbled rendering.
    translated = re.sub(
        r'([A-Za-z0-9])[\u0300-\u036f\u0900-\u0954]+(?=[\u0905-\u097f])',
        r'\1 ',
        translated
    )

    return {"translated": translated}

