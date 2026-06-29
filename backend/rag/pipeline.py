"""
pipeline.py — PolicyIQ RAG pipeline (v3)

Changes from v2:
  • Merged classify_intent() + _is_in_scope() into a single LLM call (_classify())
    that returns one of: "GENERAL" | "POLICY" | "OUT_OF_SCOPE".
  • _check_greeting() removed — all routing now goes through _classify().
    GENERAL queries (greetings, small talk, thanks, math, coding) are handled
    by _handle_general_query() which responds naturally via LLM.
  • Removed standalone ChatGroq instances — all LLM calls share _get_llm() singleton.
  • Session TTL eviction via _evict_stale_sessions().
  • Dead imports removed.
"""

import logging
import os
import re
import time
import uuid
from collections import defaultdict
from functools import lru_cache
from typing import Optional

from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    PromptTemplate,
    SystemMessagePromptTemplate,
)
from langchain_groq import ChatGroq

from backend.rag.generator import CONDENSE_PROMPT, SYSTEM_PROMPT
from backend.rag.retriever import get_retriever

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Tunable constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_HISTORY_TURNS = int(os.getenv("MAX_HISTORY_TURNS", "8"))
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.25"))
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "3600"))

# ─────────────────────────────────────────────────────────────────────────────
# Session memory store
# ─────────────────────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = defaultdict(lambda: {"history": [], "last_active": time.time()})


def _evict_stale_sessions() -> None:
    now = time.time()
    stale = [sid for sid, data in _sessions.items()
             if now - data["last_active"] > SESSION_TTL_SECONDS]
    for sid in stale:
        del _sessions[sid]


def _get_history(session_id: str) -> list[tuple[str, str]]:
    _evict_stale_sessions()
    _sessions[session_id]["last_active"] = time.time()
    return _sessions[session_id]["history"][-MAX_HISTORY_TURNS:]


def _append_history(session_id: str, human: str, ai: str) -> None:
    _evict_stale_sessions()
    _sessions[session_id]["last_active"] = time.time()
    _sessions[session_id]["history"].append((human, ai))
    if len(_sessions[session_id]["history"]) > MAX_HISTORY_TURNS:
        _sessions[session_id]["history"] = _sessions[session_id]["history"][-MAX_HISTORY_TURNS:]


# ─────────────────────────────────────────────────────────────────────────────
# Cached singletons
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_llm() -> ChatGroq:
    """Single shared ChatGroq instance for all classification and condensation calls."""
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
        groq_api_key=os.environ["GROQ_API_KEY"],
        model_kwargs={"seed": 42},
    )


def _get_chain(language: str = "en") -> ConversationalRetrievalChain:
    llm = _get_llm()
    retriever = get_retriever()

    doc_prompt = PromptTemplate(
        input_variables=["page_content", "source", "page", "section"],
        template="[Source: {source} | Page: {page} | Section: {section}]\n{page_content}",
    )

    system_prompt_text = SYSTEM_PROMPT
    if language == "hi":
        system_prompt_text += (
            "\n\nLANGUAGE RULE — HIGHEST PRIORITY — OVERRIDES ALL OTHER RULES:\n"
            "You MUST respond entirely in Hindi (Devanagari script). This is mandatory and non-negotiable.\n"
            "Exception: Keep technical terms, standard names (OISD, PESO, PNGRB), clause numbers, "
            "document names, and measurement units in English. All explanatory text, headings, "
            "bullet points, and sentences MUST be in Hindi.\n"
            "Do NOT respond in English under any circumstances."
        )

    qa_prompt = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(system_prompt_text),
        HumanMessagePromptTemplate.from_template(
            "Context from policy documents:\n{context}\n\nQuestion: {question}"
        ),
    ])

    condense_prompt = PromptTemplate(
        input_variables=["chat_history", "question"],
        template=CONDENSE_PROMPT,
    )

    return ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        condense_question_prompt=condense_prompt,
        combine_docs_chain_kwargs={
            "prompt": qa_prompt,
            "document_prompt": doc_prompt,
            "document_variable_name": "context",
        },
        return_source_documents=True,
        verbose=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Retry wrapper
# ─────────────────────────────────────────────────────────────────────────────

class RateLimitException(Exception):
    """Raised when the Groq API returns a 429 after all retries are exhausted."""
    pass


def invoke_with_retry(func, *args, max_retries: int = 3, **kwargs):
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            msg = str(exc).lower()
            if "rate_limit" in msg or "rate limit" in msg or "429" in msg:
                if attempt < max_retries - 1:
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "[Retry] Groq rate limit — waiting %ds (attempt %d/%d): %s",
                        wait, attempt + 1, max_retries, exc,
                    )
                    time.sleep(wait)
                else:
                    raise RateLimitException("Groq API rate limit exceeded after retries.")
            else:
                raise


# ─────────────────────────────────────────────────────────────────────────────
# Classifier — single LLM call, replaces classify_intent + _is_in_scope
# ─────────────────────────────────────────────────────────────────────────────

_CLASSIFY_PROMPT = """\
You are a request classifier for PolicyIQ, an IOCL (Indian Oil Corporation Limited) \
employee assistant.

Classify the user query into EXACTLY ONE of four categories:

SUMMARIZE_PAGE — the user is explicitly asking to summarize or extract information from a specific page of a specific document (e.g., "summarize page 65 of OISD-STD-144").

POLICY   — questions about OISD standards, PESO rules, PNGRB regulations, MoPNG \
guidelines, petroleum safety, fire protection, pipeline safety, LPG installations, \
work permits, tank inspection, drilling safety, gas cylinders, or any Indian oil \
and gas regulatory topic.

GENERAL  — greetings, small talk, acknowledgements, casual phrases, general knowledge, \
maths, coding, science, history, opinions, questions about the assistant itself — \
anything NOT about oil/gas/petroleum/pipeline/refinery/LPG/OISD/PESO/PNGRB/MoPNG policy. \
This includes words like "hi", "yo", "thanks", "morning", "cool", "np", "cheers", \
"what's up", and any other conversational phrase regardless of phrasing or language.

OUT_OF_SCOPE — the query mentions oil/gas topics but is clearly outside what \
IOCL's internal policy documents would cover (e.g. stock prices, news, political \
opinions, competitor analysis).

Reply with ONLY one word: SUMMARIZE_PAGE or POLICY or GENERAL or OUT_OF_SCOPE. No explanation."""


def _classify(question: str) -> str:
    """
    Single LLM call: returns "POLICY" | "GENERAL" | "OUT_OF_SCOPE".
    Fails open to "POLICY" on non-rate-limit errors.
    Propagates RateLimitException so callers can return a 429-style response.
    """
    llm = _get_llm()
    messages = [
        {"role": "system", "content": _CLASSIFY_PROMPT},
        {"role": "user", "content": question},
    ]
    try:
        response = invoke_with_retry(llm.invoke, messages)
        verdict = response.content.strip().upper()
        logger.debug("Classifier verdict: '%s' for: %.60s", verdict, question)
        if verdict in {"SUMMARIZE_PAGE", "POLICY", "GENERAL", "OUT_OF_SCOPE"}:
            return verdict
        logger.warning("Unexpected classifier verdict '%s' — defaulting to POLICY", verdict)
        return "POLICY"
    except RateLimitException:
        raise
    except Exception as exc:
        logger.warning("Classifier failed — defaulting to POLICY: %s", exc)
        return "POLICY"


# ─────────────────────────────────────────────────────────────────────────────
# Gate 2 — FAISS similarity threshold
# ─────────────────────────────────────────────────────────────────────────────

def _above_similarity_threshold(question: str) -> bool:
    retriever = get_retriever()
    vs = getattr(retriever, "vectorstore", None)
    if vs is None:
        logger.warning("Retriever has no .vectorstore — skipping similarity gate.")
        return True
    try:
        results = vs.similarity_search_with_relevance_scores(question, k=1)
        if not results:
            return False
        _, score = results[0]
        logger.debug("Similarity gate: score=%.3f threshold=%.3f", score, SIMILARITY_THRESHOLD)
        return score >= SIMILARITY_THRESHOLD
    except Exception as exc:
        logger.warning("Similarity gate error — failing open: %s", exc)
        return True


# ─────────────────────────────────────────────────────────────────────────────
# Static responses
# ─────────────────────────────────────────────────────────────────────────────

_NOT_COMPLIANCE = (
    "That's outside my area. **PolicyIQ** specialises in **Indian petroleum & energy "
    "compliance** — covering standards from **OISD, PESO, PNGRB, and MoPNG**. Try asking "
    "about **safety distances**, **fire protection norms**, **inspection frequencies**, or "
    "**approval procedures**."
)

_OUT_OF_SCOPE = _NOT_COMPLIANCE

_LOW_SIMILARITY = (
    "I couldn't find a sufficiently relevant section in the policy documents "
    "to answer this question confidently. Please try rephrasing your query, "
    "or consult your department head or the relevant policy document directly."
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _format_chat_history(history: list[tuple[str, str]]) -> str:
    lines = []
    for human, ai in history:
        lines.append(f"Human: {human}")
        lines.append(f"Assistant: {ai}")
    return "\n".join(lines)


def _condense_question(question: str, session_id: str) -> str:
    history = _get_history(session_id)
    if not history:
        return question
    llm = _get_llm()
    prompt = CONDENSE_PROMPT.format(
        chat_history=_format_chat_history(history),
        question=question,
    )
    response = invoke_with_retry(llm.invoke, prompt)
    condensed = response.content.strip().strip('"')
    return condensed or question


def _build_source_objects(result: dict) -> list[dict]:
    seen: set[tuple] = set()
    objects: list[dict] = []
    for doc in result.get("source_documents", []):
        meta = doc.metadata
        src = meta.get("source", "")
        if not src:
            continue
        page_num = str(meta.get("page", "unknown"))
        # Deduplicate by (source, page) so multiple pages from same doc are kept
        dedup_key = (src, page_num)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        category = meta.get("category", "")
        category_label = category.replace("_", " ").title() if category else "General"
        section_val = meta.get("section", "General")
        objects.append({
            "source": src,
            "section": category_label,
            "page": str(meta.get("chunk_index", 0)),
            "category": category_label,
            "page_number": page_num,
            "section_title": section_val if section_val != "General" else None,
            "chunk_index": meta.get("chunk_index", 0),
            "preview": doc.page_content.strip(),
            "score": meta.get("score"),
        })
    return objects


_GREETING_WORDS = {
    "hi", "hello", "hey", "yo", "sup", "morning", "evening", "afternoon",
    "good morning", "good evening", "good afternoon", "good night",
    "greetings", "howdy", "hola", "namaste", "namaskar",
    "thanks", "thank you", "thankyou", "thx", "ty",
    "ok", "okay", "cool", "np", "cheers", "noted", "got it",
    "sure", "alright", "great", "awesome", "perfect",
    "bye", "goodbye", "see you", "later", "take care",
    "what's up", "whats up", "wassup",
}


def _is_greeting(question: str) -> bool:
    """Check if the question is a greeting or acknowledgement."""
    q = question.strip().lower().rstrip("!?.,:;")
    # Direct match
    if q in _GREETING_WORDS:
        return True
    # Short phrases (≤4 words) that start with a greeting word
    words = q.split()
    if len(words) <= 4 and words[0] in _GREETING_WORDS:
        return True
    return False


def _handle_general_query(question: str, chat_history: list[dict], language: str = "en") -> str:
    """
    Handle GENERAL (non-compliance) queries.
    - Greetings and acknowledgements get a warm but compliance-focused response.
    - Everything else gets the standard refusal message.
    """
    if not _is_greeting(question):
        return _NOT_COMPLIANCE

    # For greetings/acks, respond warmly but stay in compliance-assistant role
    llm = _get_llm()

    system = (
        "You are PolicyIQ — a regulatory compliance assistant for "
        "Indian Oil Corporation Limited (IOCL).\n\n"
        "Response rules:\n"
        "- For greetings (hi, hey, morning, etc.): respond warmly and briefly, "
        "  introduce yourself as PolicyIQ, and mention that you help with "
        "  regulatory compliance queries about OISD, PESO, PNGRB, and MoPNG standards.\n"
        "- For acknowledgements (thanks, ok, cool, cheers, etc.): respond briefly and warmly.\n"
        "- Do NOT offer to help with general knowledge, coding, maths, or any "
        "  topic outside safety regulations and compliance.\n"
        "- Keep it to 1–2 sentences maximum.\n"
        "- Never start with 'As an AI language model…' or similar filler."
    )

    if language == "hi":
        system += "\n\nIMPORTANT: Respond in Hindi (Devanagari script). Keep all technical terms, standard names (OISD, PESO, PNGRB), clause numbers, document names, and measurement units in English. All explanatory text must be in Hindi."

    messages = [{"role": "system", "content": system}]
    for msg in chat_history:
        role = msg.get("role", "")
        if role in {"user", "assistant"}:
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": question})

    response = invoke_with_retry(llm.invoke, messages)
    return response.content.strip()

def _handle_summarize_page(question: str, session_id: str, language: str) -> dict:
    llm = _get_llm()
    extract_prompt = """Extract the document name and page number from the query.
Respond in strict JSON format: {"doc_name": "...", "page": ...}
If no page is found, set page to null.
Query: """ + question
    
    response = invoke_with_retry(llm.invoke, [{"role": "user", "content": extract_prompt}])
    try:
        import json
        data = json.loads(response.content.strip().strip("`").replace("json\n", ""))
        doc_name = data.get("doc_name")
        page_num = data.get("page")
    except Exception as e:
        raise ValueError(f"Failed to parse JSON: {e}")
        
    if not doc_name or page_num is None:
        raise ValueError("Missing doc_name or page_num")
        
    import pickle
    import pathlib
    VECTOR_STORE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "vector_store"
    pkl_path = VECTOR_STORE_DIR / "index.pkl"
    with open(pkl_path, "rb") as f:
        docstore_data = pickle.load(f)
    docstore = docstore_data[0]
    all_docs = list(docstore._dict.values())
    
    target_docs = []
    # Remove hyphens, underscores, and spaces for looser matching
    search_doc_name = doc_name.lower().replace("-", "").replace("_", "").replace(" ", "")
    for d in all_docs:
        src = d.metadata.get("source", "").lower().replace("-", "").replace("_", "").replace(" ", "")
        p = d.metadata.get("page")
        if search_doc_name in src and str(p) == str(page_num):
            target_docs.append(d)
            
    def _create_response(answer: str, sources: list = None) -> dict:
        return {
            "answer": answer,
            "session_id": session_id,
            "source_documents": sources or [],
            "is_in_scope": True,
            "rate_limited": False,
            "blocked": False,
            "block_reason": "",
        }

    if not target_docs:
        return _create_response(f"I couldn't find any content for page {page_num} of '{doc_name}'. Please ensure the document is uploaded and the page number is correct.")
        
    context = "\n\n".join([d.page_content for d in target_docs])
    system = f"You are PolicyIQ Assistant. Summarize the following document page accurately and comprehensively. Extract key points. IMPORTANT: The user specifically requested a summary for page {page_num}. Even if the text below contains a different printed page number (e.g. 'Page no. XX'), you MUST refer to it as Page {page_num} in your response to avoid confusing the user."
    if language == "hi":
        system += " Respond entirely in Hindi (Devanagari script), except for technical terms, standard names, and clause numbers which must remain in English."
    
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Context:\n{context}\n\nPlease summarize this page."}
    ]
    summary_resp = invoke_with_retry(llm.invoke, messages)
    answer = summary_resp.content.strip()
    
    _append_history(session_id, question, answer)
    
    sources = _build_source_objects({"source_documents": target_docs})
    # Since we bypassed retriever, score is none. Force it to high confidence.
    for s in sources:
        s["score"] = 1.0
        
    return _create_response(answer, sources)

# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def ask(
    question: str,
    session_id: Optional[str] = None,
    chat_history: Optional[list] = None,
    language: str = "en",
) -> dict:
    """
    Main entry point called by the /ask router.

    Returns a dict with:
        answer           str | None
        session_id       str
        source_documents list[dict]
        is_in_scope      bool
        rate_limited     bool
        blocked          bool
        block_reason     str
    """
    if not session_id:
        session_id = str(uuid.uuid4())
    if chat_history is None:
        chat_history = []

    def _ok(answer: str, sources: list | None = None) -> dict:
        return {
            "answer": answer,
            "session_id": session_id,
            "source_documents": sources or [],
            "is_in_scope": True,
            "rate_limited": False,
            "blocked": False,
            "block_reason": "",
        }

    def _rate_limited() -> dict:
        return {
            "answer": None,
            "session_id": session_id,
            "source_documents": [],
            "is_in_scope": True,
            "rate_limited": True,
            "blocked": False,
            "block_reason": "",
        }

    # ── 1. Classify (single LLM call: POLICY | GENERAL | OUT_OF_SCOPE) ───────
    try:
        intent = _classify(question)
    except RateLimitException:
        logger.warning("Rate limit during classification.")
        return _rate_limited()

    logger.info("[Pipeline] session=%s intent=%s query=%.80s", session_id, intent, question)

    # ── 2a. General query branch (greetings, small talk, general knowledge) ───
    if intent == "GENERAL":
        try:
            answer = _handle_general_query(question, chat_history, language)
        except RateLimitException:
            return _rate_limited()
        _append_history(session_id, question, answer)
        return _ok(answer)

    # ── 2b. SUMMARIZE_PAGE branch ───────────────────────────────────────────────
    if intent == "SUMMARIZE_PAGE":
        try:
            return _handle_summarize_page(question, session_id, language)
        except RateLimitException:
            return _rate_limited()
        except Exception as exc:
            logger.warning("Summarize page failed, falling back to POLICY: %s", exc)
            intent = "POLICY"

    # ── 2c. Out-of-scope branch ───────────────────────────────────────────────
    if intent == "OUT_OF_SCOPE":
        return {
            "answer": _OUT_OF_SCOPE,
            "session_id": session_id,
            "source_documents": [],
            "is_in_scope": False,
            "rate_limited": False,
            "blocked": False,
            "block_reason": "",
        }

    # ── 3. Condense follow-up into standalone query ───────────────────────────
    try:
        condensed = _condense_question(question, session_id)
    except RateLimitException:
        logger.warning("Rate limit during question condensation.")
        return _rate_limited()
    except Exception as exc:
        logger.warning("Condensation failed — using raw question: %s", exc)
        condensed = question

    logger.debug("[Pipeline] condensed='%.80s'", condensed)

    # ── 4. Gate 2 — FAISS similarity threshold ────────────────────────────────
    if not _above_similarity_threshold(condensed):
        logger.info("[Pipeline] Gate 2 rejected (low similarity): %.60s", condensed)
        return {
            "answer": _LOW_SIMILARITY,
            "session_id": session_id,
            "source_documents": [],
            "is_in_scope": True,
            "rate_limited": False,
            "blocked": False,
            "block_reason": "",
        }

    # ── 5. RAG generation ─────────────────────────────────────────────────────
    chain = _get_chain(language)
    try:
        result = invoke_with_retry(
            chain.invoke, {"question": condensed, "chat_history": []}
        )
    except RateLimitException:
        logger.warning("Rate limit during RAG generation.")
        return _rate_limited()
    except Exception as exc:
        logger.error("Chain invocation failed for session %s: %s", session_id, exc)
        raise

    answer: str = result["answer"]
    _append_history(session_id, question, answer)
    return _ok(answer, _build_source_objects(result))
