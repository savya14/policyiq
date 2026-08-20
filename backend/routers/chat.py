import os
import re
import uuid
import unicodedata
from fastapi import APIRouter, HTTPException, Request
from groq import Groq

from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.rag.pipeline import ask
from backend.schemas import (
    AskRequest,
    AskResponse,
    FeedbackRequest,
    FeedbackResponse,
    DocumentsResponse,
    DocumentMeta,
)
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
            messages=[{"role": "user", "content": user_query}],
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
    print(
        f"--- RECEIVED ASK REQUEST: language='{payload.language}', question='{user_query}' ---"
    )

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
            ),
        )

    # --- EXISTING: RAG PIPELINE ---
    try:
        result = ask(
            question=user_query,
            session_id=payload.session_id,
            chat_history=payload.chat_history,
            language=payload.language,
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
        "is_positive": request.is_positive,
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
            try:
                import os

                if not os.access(pkl_path, os.R_OK):
                    raise ValueError("Index file is not readable.")
                with open(pkl_path, "rb") as f:
                    docstore_data = pickle.load(f)
                docstore = docstore_data[0]
            except Exception as e:
                import logging

                logging.error("Failed to load FAISS index: %s", e)
                raise ValueError(f"Could not load vector store: {e}")
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
        return re.sub(r"^(\d+_)+", "", name)

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
    body = await request.json()
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    system_prompt = (
        "You are a professional Hindi translator for Indian Oil Corporation Limited (IOCL) compliance and safety documents.\n"
        "Translate the given English regulatory compliance text entirely into natural, accurate, formal Hindi in Devanagari script.\n\n"
        "CRITICAL TRANSLATION & FORMATTING RULES:\n"
        "1. TRANSLATE ALL EXPLANATIONS, DESCRIPTIONS & TABLE CONTENT:\n"
        "   - Translate all Markdown table headers into clear Hindi (e.g., 'Application / Location' -> 'अनुप्रयोग / स्थान', 'Calibration Frequency' -> 'कैलिब्रेशन आवृत्ति / अंतराल', 'Minimum Distance' -> 'न्यूनतम दूरी', 'Vessel Capacity' -> 'पात्र क्षमता').\n"
        "   - Translate all table cell text, time intervals, and descriptions into Hindi (e.g., 'once every 6 months' -> 'हर 6 महीने में एक बार', 'once a week' -> 'सप्ताह में एक बार', 'General LPG installation' -> 'सामान्य LPG स्थापना').\n"
        "   - Translate lead-in summaries, bullet points, and source notes into fluent Hindi.\n"
        "2. STRICTLY PRESERVE ALL MARKDOWN STRUCTURE:\n"
        "   - Keep all table rows, column separators (`|`), alignment rows (`| :--- | :--- |`), bullet dashes (`-`), and bold tags (`**...**`) strictly intact.\n"
        "   - Ensure every bold marker `**` has its matching closing `**` on the same line.\n"
        "3. PRESERVE ONLY SPECIFIC ENTITY NAMES IN ENGLISH:\n"
        "   - Keep standard names (e.g., OISD-STD-144, PESO, PNGRB, MoPNG), section numbers (e.g., Section 9.5.9.3), rule numbers (e.g., Rule 138), and measurement units/symbols (e.g., m, m³, Cu. Mt., kg/cm², psi, bar) in English.\n"
        "   - Everything else must be rendered in Hindi Devanagari script.\n"
        "4. NO THINKING/META COMMENTARY:\n"
        "   - Output ONLY the translated Markdown response. No conversational phrases, preamble, or commentary."
    )

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
        )
        translated = response.choices[0].message.content.strip()
    except Exception as e:
        import logging
        logging.error("Translation API error: %s", e)
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")

    # Strip any <think>...</think> reasoning blocks
    translated = re.sub(
        r"<[Tt][Hh][Ii][Nn][Kk]>.*?</[Tt][Hh][Ii][Nn][Kk]>",
        "",
        translated,
        flags=re.DOTALL,
    )
    translated = re.sub(
        r"<[Tt][Hh][Ii][Nn][Kk]>.*$", "", translated, flags=re.DOTALL
    ).strip()

    # ── Fix Unicode garbling at English↔Hindi word boundaries ────────────
    translated = unicodedata.normalize("NFC", translated)
    translated = re.sub(
        r"([A-Za-z0-9])[\u0300-\u036f\u0900-\u0954]+(?=[\u0905-\u097f])",
        r"\1 ",
        translated,
    )

    # Balance bold markers per line
    out_lines = []
    for line in translated.split("\n"):
        if line.count("**") % 2 != 0:
            idx = line.rfind("**")
            line = line[:idx] + line[idx + 2:]
        out_lines.append(line)
    translated = "\n".join(out_lines).strip()

    return {"translated": translated}
