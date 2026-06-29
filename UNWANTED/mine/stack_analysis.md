# PolicyIQ — Technology Stack Analysis
### Brutally Honest. No Diplomacy.

> Evaluated against: hackathon success · development speed · maintainability · scalability · deployment simplicity · resume value

---

## Layer 1 — Frontend Framework

**Blueprint choice:** Streamlit 1.38.0

### Pros
- Ships a full chat UI with session state, file uploader, expander, and sidebar in ~80 lines of Python
- Native HF Spaces support — no separate build step
- `st.cache_resource` solves the model-loading problem with one decorator
- `st.write_stream()` enables streaming output trivially
- Zero HTML/CSS/JS knowledge required

### Cons
- **Deeply unprofessional visual output.** Streamlit apps look like Streamlit apps. Every recruiter has seen ten of them. The default theme communicates "I followed a tutorial", not "I built something."
- Single-threaded execution model — one user's long LLM call blocks everyone else's UI
- No real routing — `st.navigation()` is a recent hack, not a real SPA router
- Session state resets on full page refresh — the "token-based auth" workaround in the admin panel is a band-aid over a fundamental architectural mismatch
- Cannot add custom animations, responsive layouts, or branded styling without fighting the framework

### Better Alternatives

| Alternative | Why It's Better | Why It Loses |
|---|---|---|
| **Gradio** | Better suited to ML demos, Blocks API is cleaner than Streamlit for multi-step workflows | Still looks generic; same "demo project" aesthetic |
| **Next.js + React** | Professional UI, real routing, SSR, full styling control | Takes 3× longer to build; adds JavaScript context-switching |
| **FastAPI + HTMX** | Lightweight, Python backend, partial page updates without full React | Less well-known; harder to showcase to non-technical interviewers |

### Final Recommendation
**Keep Streamlit** — but invest 4 hours in a custom theme (`config.toml`) with a dark background, branded colors, and custom CSS via `st.markdown()`. The framework choice is defensible for this context. The default styling is not.

---

## Layer 2 — Backend Framework

**Blueprint choice:** No backend framework. RAG logic imported directly into Streamlit as Python modules.

### Pros
- Zero CORS issues
- No double-container overhead
- Deployment is a single `streamlit run app.py` command
- The blueprint explicitly documents this decision and why FastAPI was rejected — that's good engineering thinking

### Cons
- **Streamlit is not a web framework.** It has no request/response model, no middleware, no proper auth layer, no rate limiting, no API versioning. When the blueprint tries to add token-based auth by storing a string in `st.session_state`, it is working around the fact that Streamlit was never designed for multi-user access control.
- The `@st.cache_resource` cache is shared across all users of the same worker process — this means one user's data can influence another user's session if the cache is not managed carefully
- No way to add a proper REST API for future integrations (mobile app, Slack bot, etc.)
- Testing is extremely difficult — you cannot unit test Streamlit pages without spinning up a full Streamlit server

### Better Alternatives

| Alternative | Trade-off |
|---|---|
| **FastAPI + Streamlit (two containers)** | Blueprint explicitly rejected this — for HF Spaces free tier, the overhead is real. Rejection is correct. |
| **FastAPI alone + vanilla JS frontend** | More scalable, testable, and extensible. ~3× more code. Correct choice for production, overkill for portfolio. |

### Final Recommendation
**Keep the no-backend-framework approach** — it is the correct call for this deployment target and timeline. The limitation is real but explicitly acknowledged. An interviewer who asks "why no FastAPI?" gets a thoughtful answer. That's better than adding complexity for its own sake.

---

## Layer 3 — Database (Metadata / State Storage)

**Blueprint choice:** `indexed_hashes.json` — a flat JSON file committed to GitHub.

### Pros
- Zero setup, zero dependencies
- Works on any filesystem
- Readable in any text editor

### Cons
- **This is not a database. This is a config file masquerading as a database.**
- Non-atomic read-modify-write (race condition documented in risk analysis)
- No transactions, no rollback, no query capability
- Grows unbounded — every indexed file adds a row forever
- Cannot store query logs, user sessions, or document metadata without inventing a new JSON schema each time
- Committed to GitHub — binary history bloat and accidental secret exposure risk

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **SQLite** | Single file, zero server, ACID transactions, proper schema, Python stdlib (`sqlite3`). Strictly better than JSON for structured state. Takes 30 minutes to add. |
| **TinyDB** | Pure-Python JSON database with a proper query API. Drop-in replacement for the JSON approach with ~5 lines of change. |
| **Supabase / Neon Postgres** | Full relational DB with free tier. Overkill for document hashes, useful for query logging and user analytics. |

### Final Recommendation
**Replace `indexed_hashes.json` with SQLite.** This is a direct upgrade with no downside. The schema would be:
```sql
CREATE TABLE indexed_documents (
    id INTEGER PRIMARY KEY,
    filename TEXT UNIQUE,
    sha256 TEXT UNIQUE,
    indexed_at TEXT,
    chunk_count INTEGER,
    file_size_bytes INTEGER
);
```
ACID transactions immediately fix the race condition in `deduplicator.py` without `filelock`. SQLite is also a far better interview talking point than "we used a JSON file." The change takes 45 minutes and touches only `deduplicator.py` and `admin.py`.

---

## Layer 4 — Vector Database

**Blueprint choice:** FAISS (faiss-cpu 1.8.0), index committed to GitHub as binary files.

### Pros
- Zero external service dependency — runs entirely on disk
- Battle-tested at scale (Meta's production search)
- LangChain integration is mature and well-documented
- Index persists as flat files — can be committed to git or copied anywhere
- For 5,000–15,000 vectors (8–12 PDFs), performance is sub-millisecond

### Cons
- **No vector deletion.** This is documented in the risk analysis (RISK-3). The only way to remove a document is to rebuild the entire index. For a compliance system where standards get superseded, this is a genuine operational problem.
- Binary files in Git bloat the repo history (documented in risk analysis — SCALE-2)
- No built-in filtering (e.g., "search only within OISD-118") — metadata filtering requires a post-retrieval pass
- Not accessible from any other service — no REST API, no shared access
- If the binary files get corrupted, there is no recovery path short of rebuilding from scratch

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **ChromaDB** | Persistent SQLite-backed vector store. Supports metadata filtering natively. Supports document deletion. No binary files in git. Free. LangChain integration is identical. **Strictly better for this use case.** |
| **Qdrant** | Cloud-hosted free tier, full REST API, payload filtering, named collections. More complex setup. Strong resume signal. |
| **Pinecone** | Managed, excellent DX, strong resume signal. Free tier is limited (1 index, 1M vectors). Works, but adds cloud dependency. |
| **Weaviate** | Overkill. Ignore. |

### Final Recommendation
**Replace FAISS with ChromaDB.** This is the most impactful change in the entire stack.

- Chroma's `PersistentClient` stores the index in a local directory (`chroma_db/`) — same workflow as FAISS but with a proper SQLite backend
- `collection.delete(where={"source": "OISD_118_Rev3"})` — document deletion works natively. RISK-3 disappears entirely.
- The `chroma_db/` directory is committed to git exactly like `vector_store/` — same deployment pattern
- Metadata filtering: `retriever.invoke(query, filter={"source": "OISD_118"})` — enables scoped queries
- LangChain swap: `FAISS.from_documents()` → `Chroma.from_documents()`. It's a one-line import change.
- `chromadb` is ~50MB installed vs FAISS's similar footprint

The only reason the blueprint chose FAISS over Chroma is familiarity and tutorial prevalence. In 2025, Chroma is the correct default for a small-to-medium RAG project.

---

## Layer 5 — Authentication

**Blueprint choice:** `st.session_state.admin_token = "authenticated"` — a string stored in Streamlit session state.

### Assessment: This Is Not Authentication.

It is a flag variable that:
- Resets on full page refresh (documented as "intentional" — it is not intentional, it is a constraint of the framework)
- Provides no protection against direct URL access to admin functions
- Is shared within a Streamlit process — edge cases around session mixing are possible
- Cannot be revoked without restarting the app
- Has no audit trail
- Has no brute-force protection (unlimited password attempts)

The blueprint treats this as a feature ("token survives within tab session"). That is rationalising a limitation, not designing a security model.

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **HTTP Basic Auth via reverse proxy (nginx)** | Correct for protecting a Streamlit app. HF Spaces doesn't expose nginx config. Not applicable here. |
| **`streamlit-authenticator` library** | PyPI package built specifically for Streamlit auth. Supports hashed passwords, session cookies, logout. Drop-in replacement. Takes 1 hour. |
| **HF Spaces built-in access control** | HF Spaces Pro/Enterprise supports Space-level access control. Not available on free tier. |
| **Separate admin CLI tool** | Admin operations (upload, rebuild index) run as CLI commands locally — no web-facing admin panel at all. Admin panel removed from the deployed app. Cleanest security model. |

### Final Recommendation
For a portfolio project on HF Spaces free tier, **use `streamlit-authenticator`** for the admin panel — it is purpose-built for this problem and shows you know the right tool exists. For the chat portal, document that it is intentionally public (with rate limiting awareness).

Do not describe the current `session_state` approach as "token-based auth" in interviews. An interviewer who asks a follow-up question will immediately identify it as a variable name check, not authentication.

---

## Layer 6 — Deployment Platform

**Blueprint choice:** Hugging Face Spaces (free tier, Streamlit SDK).

### Pros
- Zero cost
- Native Streamlit support — no Docker, no Heroku Procfile, no nginx config
- GitHub integration — push to deploy
- Secrets management built-in
- HF brand association is genuinely positive for ML portfolio projects
- The URL pattern `huggingface.co/spaces/username/policyiq` is recognizable to ML interviewers

### Cons
- **No persistent storage.** Every restart resets everything except what's committed to GitHub. This is the root cause of multiple architectural hacks (index in git, temp file admin uploads).
- 30-second cold start on free tier after 15 minutes of inactivity — unacceptable for live demos
- CPU only — acceptable here because the index is pre-built, but limits future development
- Single worker — no horizontal scaling, no request queuing
- Cannot add custom domains on free tier

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **Render (free tier)** | Persistent disk, custom domains, no cold start (on paid tier). Free tier has cold starts too. Better DX than HF Spaces. Less ML brand recognition. |
| **Railway** | $5/month for always-on service with persistent disk. Worth it for a live demo. No cold starts. |
| **Streamlit Community Cloud** | Free, native Streamlit, GitHub integration. Same cold start problem. Slightly more mainstream than HF. |
| **Google Cloud Run** | Pay-per-request, scales to zero, persistent volumes possible. More DevOps complexity. Strong resume signal. |

### Final Recommendation
**Keep HF Spaces as primary** — the ML brand association is real. But **also deploy on Railway ($5/month) as the always-on demo link** for interviews and recruiter clicks. The cold-start problem on HF Spaces is a demo killer. Railway eliminates it for the price of a coffee.

---

## Layer 7 — LLM Provider

**Blueprint choice:** Groq (free tier) running LLaMA 3.3 70b Versatile.

### Pros
- **Groq's inference speed is genuinely exceptional.** 500–800 tokens/second on LLaMA 3 70b. This is 10–20× faster than OpenAI. For a demo, speed is a visible feature.
- Free tier is generous: 30 req/min, 6,000 tokens/min, 500,000 tokens/day
- LLaMA 3.3 70b is a strong model for instruction-following — competitive with GPT-4o for structured Q&A
- OpenAI-compatible API — switching providers is one line

### Cons
- **Single point of failure.** No fallback if rate limits are hit or free tier changes.
- 500K tokens/day sounds generous until you calculate: 2,500 tokens/query × 200 queries = daily limit reached
- Real IOCL compliance data leaving the infrastructure via Groq's API is a data governance concern

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **OpenAI GPT-4o-mini** | $0.15/1M tokens — essentially free for a demo. Better reliability. Worse latency. |
| **Google Gemini Flash 2.0** | Free tier: 1,500 req/day, 1M tokens/min. Stronger free tier than Groq. Fast. |
| **Ollama (local, dev only)** | Zero API cost, zero rate limits during development. Cannot run on HF Spaces free tier. |

### Final Recommendation
**Keep Groq as primary.** The speed advantage is real and visible. **Add Gemini Flash 2.0 as a fallback provider** — it is the strongest free-tier alternative, and demonstrating multi-provider awareness is a genuine interview differentiator.

---

## Layer 8 — Embedding Model

**Blueprint choice:** `sentence-transformers/all-MiniLM-L6-v2` (80MB, CPU).

### Assessment: Correct. No change needed.

**Why it's correct:** 80MB, offline, no API cost, no rate limits, adequate quality for structured regulatory English, consistent model between index-time and query-time. The blueprint's reasoning is sound.

The only scenario where you'd upgrade: corpus grows to 100K+ chunks and retrieval quality degrades measurably on the eval set. At that point, try `BAAI/bge-small-en-v1.5` (marginally better, similar size) before committing to a larger model.

### Final Recommendation
**Keep `all-MiniLM-L6-v2`** — this is the right call.

---

## Layer 9 — RAG Framework

**Blueprint choice:** LangChain 0.2.16 (`RetrievalQA` chain).

### The Honest Assessment

`RetrievalQA` is **deprecated** in LangChain 0.3+. The blueprint acknowledges this by pinning to 0.2.16 — which means you are intentionally building on a deprecated API because the newer API is unstable. The blueprint has a `CRITICAL` warning about not changing versions, a dedicated error section for LangChain import failures, and a note that "LangChain breaks constantly between minor versions."

That is not a sign of a healthy dependency. That is a sign you've chosen a framework that is working against you.

Five layers of abstraction wrap what is fundamentally: "retrieve chunks, format prompt, call LLM, return answer."

### Better Alternatives

| Alternative | Verdict |
|---|---|
| **LlamaIndex** | Purpose-built for document indexing. Better hierarchical document support (directly applicable to OISD clause hierarchies). More stable API. Strong 2025 resume signal. |
| **Direct Python SDK** | ~60 lines. No version pinning. No abstraction layers to debug. Full control. Trivial to add streaming. Easiest to test. |
| **LangChain 0.3 + LCEL** | The correct LangChain path. Migration from 0.2 `RetrievalQA` is non-trivial. |

### The direct Python approach (no framework):
```python
from sentence_transformers import SentenceTransformer
import chromadb, groq

model = SentenceTransformer("all-MiniLM-L6-v2")
client = chromadb.PersistentClient("chroma_db/")
collection = client.get_collection("policyiq")
groq_client = groq.Groq()

def ask(question: str) -> dict:
    embedding = model.encode(question).tolist()
    results = collection.query(query_embeddings=[embedding], n_results=5)
    context = "\n\n".join(results["documents"][0])
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
        ],
        temperature=0.2
    )
    return {"answer": response.choices[0].message.content, "sources": results["metadatas"][0]}
```

That is the entire RAG pipeline. No import errors. No version hell. No `allow_dangerous_deserialization`. Trivial to add streaming. Trivial to unit test.

### Final Recommendation
**If you have the time: replace LangChain with direct Python SDK calls.** The code is simpler, the debugging is straightforward, and the absence of LangChain is itself a signal — it shows you understand the underlying mechanics rather than relying on an abstraction.

**If you don't have time: keep LangChain 0.2.16 pinned.** The version pinning strategy is correct given the constraints. But do not describe LangChain as a strength of the project in interviews — describe it as "we used LangChain for speed of development and then identified the specific limitations of pinning to a deprecated API."

**Best option for resume value: use LlamaIndex instead.** It differentiates you from the sea of identical LangChain-RAG projects on GitHub. Purpose-built for the exact problem (hierarchical document retrieval). Stable API. Strong 2025 signal.

---

## Layer 10 — Overall System Architecture

### What the Blueprint Gets Right (Don't Change These)
- ✅ **Offline/online pipeline split** — build index locally, deploy only the query layer. This is how production RAG works.
- ✅ **Metadata-enriched chunking** — injecting section hierarchy into chunk text is a real technique that most tutorials skip.
- ✅ **SHA-256 deduplication** — correct pattern, correctly applied.
- ✅ **Automated evaluation harness** — more than most portfolio RAG projects have.
- ✅ **Groq for inference** — the speed advantage is real and demonstrable.

### What the Architecture Gets Wrong

**1. The index is stored in Git.**  
Git is version control for source code. Storing ML artifacts in Git is an anti-pattern. LFS mitigates it but doesn't fix it. The correct answer for production is object storage (S3/GCS/HF Hub datasets). For this project's constraints, it's acceptable — but own the trade-off explicitly.

**2. No separation between admin and user paths.**  
The admin panel lives in the same Streamlit process as the user chat. One admin rebuild operation can degrade performance for all concurrent users.

**3. No observability.**  
No metrics, no query logging, no error tracking. Silent wrong answers are undetectable. This is the most significant architectural gap for a compliance system.

---

## The Four Stacks

### A. Blueprint + Minimal Changes *(execution speed, lowest risk)*

| Layer | Choice | Change from Blueprint |
|-------|--------|-----------------------|
| Frontend | Streamlit + custom theme | Add `config.toml` |
| Backend | None | No change |
| Metadata DB | **SQLite** | Replace JSON file |
| Vector DB | **ChromaDB** | Replace FAISS |
| Auth | **`streamlit-authenticator`** | Replace session_state flag |
| Deployment | HF Spaces + Railway | Add Railway for always-on |
| LLM | Groq + Gemini fallback | Add fallback |
| Embeddings | all-MiniLM-L6-v2 | No change |
| RAG Framework | LangChain 0.2.16 | No change |

**Additional effort:** ~1.5 days

---

### B. Greenfield Stack *(best technical decisions, no legacy constraints)*

| Layer | Choice |
|-------|--------|
| Frontend | Streamlit + custom theme |
| Backend | FastAPI (minimal, separate service) |
| Metadata DB | SQLite |
| Vector DB | ChromaDB |
| Auth | `streamlit-authenticator` |
| Deployment | Railway (FastAPI) + HF Spaces (Streamlit) |
| LLM | Groq + OpenAI gpt-4o-mini fallback |
| Embeddings | all-MiniLM-L6-v2 |
| RAG Framework | **Direct Python SDK** (no LangChain) |

**Additional effort vs. blueprint:** +3–5 days

---

### C. Hackathon Stack *(working demo in 24–48 hours)*

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Streamlit | Ship in hours |
| Backend | None | Skip |
| Metadata DB | SQLite | 15 minutes, fixes race condition |
| Vector DB | **ChromaDB** | Same API as FAISS, better defaults |
| Auth | Single password input | Good enough for 48 hours |
| Deployment | HF Spaces | Push and go |
| LLM | Groq LLaMA 3.3 70b | Fastest visible response for judges |
| Embeddings | all-MiniLM-L6-v2 | No change |
| RAG Framework | **Direct Python SDK** | Zero version debugging time |

**Win condition:** Working demo with accurate citations in 24 hours. No-LangChain path is critical — version debugging is a hackathon killer.

---

### D. Resume-Maximising Stack *(strongest signal for interviews)*

| Layer | Choice | Why It Signals Well |
|-------|--------|---------------------|
| Frontend | Streamlit + custom theme | Shows polish beyond tutorials |
| Backend | FastAPI (minimal) | "FastAPI" on resume > "no backend" |
| Metadata DB | SQLite | Shows appropriate tool selection |
| Vector DB | **Qdrant (free cloud tier)** | Modern, 2025 job postings, REST API |
| Auth | `streamlit-authenticator` | Correct tool, shows awareness |
| Deployment | HF Spaces + GitHub Actions | Shows MLOps thinking |
| LLM | Groq + fallback | Multi-provider awareness |
| Embeddings | all-MiniLM-L6-v2 | Correct, explainable |
| RAG Framework | **LlamaIndex** | Differentiates from LangChain crowd |

**Why LlamaIndex beats LangChain for resume value:** Every RAG project on GitHub uses LangChain. LlamaIndex shows deliberate choice. It handles document hierarchies better, which you can explain with the OISD clause hierarchy use case. It is a more interesting interview conversation starter.

---

## Final Verdict

> ### **Modify the blueprint stack.**

The core architecture is sound. The RAG logic is good. The evaluation harness is the best thing in the project. **Do not rebuild from scratch.**

Make three targeted changes that materially improve the project with minimal effort:

| # | Change | Effort | What It Fixes |
|---|--------|--------|---------------|
| **1** | FAISS → ChromaDB | 2 hours | Document deletion (RISK-3), metadata filtering, binary-in-git problem |
| **2** | `indexed_hashes.json` → SQLite | 45 min | Race condition (RISK-4), proper schema, ACID transactions |
| **3** | Session state flag → `streamlit-authenticator` | 1 hour | Real auth pattern, not a variable name check |

**Do not describe the session_state approach as "token-based authentication" in any interview.** It will not survive a follow-up question.

**Do not change the embedding model.** It is correct.

**Do not change Groq.** The speed is a genuine feature.

**The LangChain choice is the most debatable one.** If you have 6 hours to spare, drop it and use direct Python + Chroma SDK. If you don't, keep it pinned and document the trade-off explicitly — the version pinning itself shows you understand the dependency management problem, which is worth something.
