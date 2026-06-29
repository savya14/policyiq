# PolicyIQ v2 — Migration Guide

## What changed

| File | Change |
|------|--------|
| `backend/schemas.py` | Added `session_id` field to request and response |
| `backend/rag/generator.py` | Added `CONDENSE_PROMPT` and `RELEVANCE_GATE_PROMPT` |
| `backend/rag/pipeline.py` | Full rewrite — ConversationalRetrievalChain, two gates, session memory |
| `backend/routers/chat.py` | Passes/returns `session_id` |
| `indexing/chunker.py` | Category auto-detection + metadata on every chunk |
| `indexing/update_index.py` | `document_registry.json` tracking, `--list` flag |

---

## 1. Drop in the files

```bash
cp schemas.py          ~/Desktop/policyiq/backend/
cp generator.py        ~/Desktop/policyiq/backend/rag/
cp pipeline.py         ~/Desktop/policyiq/backend/rag/
cp chat.py             ~/Desktop/policyiq/backend/routers/
cp chunker.py          ~/Desktop/policyiq/indexing/
cp update_index.py     ~/Desktop/policyiq/indexing/
```

---

## 2. Start the server

```bash
source ~/Desktop/policyiq/.venv/bin/activate
lsof -ti:8000 | xargs kill -9
cd ~/Desktop/policyiq
uvicorn backend.main:app --reload
```

---

## 3. Test conversation memory

```bash
# Turn 1 — start a session (no session_id sent)
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "what is the safe distance for LPG storage?"}' \
  | python3 -m json.tool
# → copy the session_id from the response

# Turn 2 — follow-up using the same session_id
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "what about for capacity above 1000 kg?", "session_id": "PASTE_HERE"}' \
  | python3 -m json.tool
# → should resolve "that" to LPG storage without needing a full re-question
```

---

## 4. Test the relevance gate

```bash
# Off-topic — should be blocked by Gate 1 (LLM pre-check)
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "what is the best recipe for biryani?"}' \
  | python3 -m json.tool
# → is_in_scope: false, polite redirect, no RAG call

# Vague but in-scope — passes Gate 1, may be caught by Gate 2
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "I have an issue"}' \
  | python3 -m json.tool
```

Tune the similarity threshold via env var (no code change needed):
```bash
SIMILARITY_THRESHOLD=0.40 uvicorn backend.main:app --reload
```

---

## 5. Add new documents

```bash
cd ~/Desktop/policyiq

# Auto-detect category from filename and content
python -m indexing.update_index /path/to/HR_Leave_Policy_2024.pdf

# Override category
python -m indexing.update_index /path/to/somefile.pdf --category delegation

# See what's indexed
python -m indexing.update_index --list

# Restart server to load updated index into memory
lsof -ti:8000 | xargs kill -9
uvicorn backend.main:app --reload
```

The registry is saved to `document_registry.json` in the project root.

---

## 6. Rebuild existing chunks with category metadata (optional)

Your 13 existing PDFs were indexed without category tags.
To backfill, re-run `build_index.py` — it will pick up the new `chunker.py`
and tag every chunk. This is safe but takes a few minutes.

```bash
python -m indexing.build_index   # or however your original script is invoked
```

---

## Tuning reference

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `SIMILARITY_THRESHOLD` | `0.25` | Minimum normalised relevance score (0–1). Raise to 0.40+ to require stronger FAISS matches. |
| `MAX_HISTORY_TURNS` | `8` | How many conversation turns to keep per session. |
| `GROQ_API_KEY` | (required) | Groq API key — must be set in environment. |
