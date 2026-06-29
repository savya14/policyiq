# PolicyIQ Learning Curriculum — Master Overview

> **Who this is for:** A complete beginner to Python, FastAPI, React, and RAG.  
> **How to read it:** Follow one real user question through the entire system, stage by stage.

---

## The Big Picture

PolicyIQ is a **RAG chatbot** — a system that uses real documents (OISD, PESO, PNGRB PDFs) to ground an AI's answers instead of letting it guess. Here is the full journey of a single question:

```
User types a question
       │
       ▼
┌─────────────────────┐
│  FRONTEND           │  React app running in the browser
│  Chat.jsx           │  Captures input, manages state
│  (Stage 1)          │
└────────┬────────────┘
         │  user types + presses Enter
         ▼
┌─────────────────────┐
│  FRONTEND API CALL  │  axios POST /ask
│  client.js          │  Attaches URL, headers, body
│  (Stage 2)          │
└────────┬────────────┘
         │  HTTP request travels over network
         ▼
┌─────────────────────┐
│  BACKEND            │  FastAPI server on port 8000
│  main.py            │  CORS, routing
│  routers/chat.py    │  /ask endpoint receives request
│  schemas.py         │  Validates & parses JSON body
│  (Stage 3)          │
└────────┬────────────┘
         │  AskRequest object created
         ▼
┌─────────────────────┐
│  SECURITY GUARD     │  Prompt injection check via Groq
│  routers/chat.py    │  Llama Prompt Guard 2
│  auth.py            │  JWT for admin routes only
│  (Stage 4)          │
└────────┬────────────┘
         │  safe query passed onward
         ▼
┌─────────────────────┐
│  RAG ORCHESTRATION  │  pipeline.py — the conductor
│  pipeline.py        │  Gate 1: scope check
│  (Stage 5)          │  Gate 2: similarity threshold
└────────┬────────────┘
         │  condensed, validated question
         ▼
┌─────────────────────┐
│  VECTOR RETRIEVAL   │  FAISS similarity search
│  retriever.py       │  Top-5 chunks returned
│  vector_store/      │  Pre-built index on disk
│  (Stage 6)          │
└────────┬────────────┘
         │  5 text chunks + metadata
         ▼
┌─────────────────────┐
│  LLM GENERATION     │  Prompt template + chunks → LLM
│  generator.py       │  Llama 3.3 70B via Groq API
│  pipeline.py        │  Answer text returned
│  (Stage 7)          │
└────────┬────────────┘
         │  answer string + source docs list
         ▼
┌─────────────────────┐
│  RESPONSE ASSEMBLY  │  Wrap in AskResponse Pydantic model
│  schemas.py         │  Serialize to JSON
│  routers/chat.py    │  HTTP 200 sent back
│  (Stage 8)          │
└────────┬────────────┘
         │  JSON response travels over network
         ▼
┌─────────────────────┐
│  FRONTEND RENDER    │  React state updated
│  ChatMessage.jsx    │  Chat bubble + source cards drawn
│  (Stage 9)          │  👍👎 feedback buttons
└─────────────────────┘
```

---

## Table of Contents

| Stage | Topic | File |
|-------|-------|------|
| [Stage 1](./01-frontend-user-input.md) | Frontend: User Input | `Chat.jsx`, `ChatMessage.jsx` |
| [Stage 2](./02-frontend-api-call.md) | Frontend: API Call | `client.js`, `.env.local` |
| [Stage 3](./03-backend-receiving-request.md) | Backend: Receiving the Request | `main.py`, `routers/chat.py`, `schemas.py` |
| [Stage 4](./04-backend-auth.md) | Backend: Auth & Security | `auth.py`, `routers/chat.py` |
| [Stage 5](./05-rag-orchestration.md) | RAG: Orchestration | `pipeline.py` |
| [Stage 6](./06-rag-retrieval.md) | RAG: Retrieval | `retriever.py`, `vector_store/` |
| [Stage 7](./07-rag-generation.md) | RAG: Generation | `generator.py`, `pipeline.py` |
| [Stage 8](./08-backend-response-assembly.md) | Backend: Response Assembly | `schemas.py`, `routers/chat.py` |
| [Stage 9](./09-frontend-rendering.md) | Frontend: Rendering | `ChatMessage.jsx`, `TypingIndicator.jsx` |
| [Stage 10](./10-tying-it-together.md) | Tying It Together | Full story walkthrough |

---

## Suggested Reading Order

1. **Start here** — read this overview once to get the map.
2. **Read Stage 1** — understand React components and state before any API concepts.
3. **Read Stage 2** — now the API call will make sense.
4. **Read Stage 3** — the backend receiving end.
5. **Read Stage 5 first, then 6 and 7** — Stage 5 is the orchestrator; 6 and 7 are the workers it calls.
6. **Read Stage 4 and 8** — security and packaging (lighter reading).
7. **Read Stage 9** — the UI receiving the response.
8. **Finish with Stage 10** — the complete story told as a narrative.

> 💡 **Tip:** Open VS Code split-screen: docs on the left, actual source file on the right. Read side by side.

---

## Master Glossary

All terms introduced across the whole curriculum, in alphabetical order.

| Term | Plain-English Definition |
|------|--------------------------|
| **API** | Application Programming Interface — a defined way for two programs to talk to each other over the network. |
| **async/await** | JavaScript keywords that let code "pause" while waiting for a network response, without freezing the whole browser. |
| **axios** | A JavaScript library that makes HTTP requests easier than the built-in `fetch`. Used in `client.js`. |
| **BaseModel (Pydantic)** | A Python class you inherit from to define a data shape. FastAPI uses it to validate incoming JSON automatically. |
| **chunk** | A short piece of text (300–600 characters) cut from a larger PDF. FAISS searches over chunks, not whole documents. |
| **chunk_overlap** | How many characters two consecutive chunks share. Overlap prevents a sentence being cut in half between chunks. |
| **CORS** | Cross-Origin Resource Sharing — a browser security rule that blocks a website from calling a different domain's API unless that API explicitly allows it. |
| **cosine similarity** | A way to measure how "close" two embedding vectors are. Ranges from 0 (nothing in common) to 1 (identical meaning). |
| **ConversationalRetrievalChain** | A LangChain object that wires together a retriever + an LLM + conversation history into one callable unit. |
| **dependency injection** | FastAPI's system of automatically passing objects (like auth tokens) to endpoint functions without the caller needing to do anything. |
| **embedding** | A list of numbers (a vector) that represents the *meaning* of a piece of text. Similar meanings → similar numbers → close in vector space. |
| **endpoint** | A URL that your backend listens on and responds to. E.g., `/ask` is an endpoint. |
| **env var** | Environment variable — a configuration value stored outside your code (in `.env` files or shell), so secrets like API keys aren't hard-coded. |
| **FAISS** | Facebook AI Similarity Search — a library that stores millions of embedding vectors and can instantly find the closest ones to a query vector. |
| **FastAPI** | A Python web framework for building APIs. Automatically generates documentation, validates requests, and is very fast. |
| **grounded generation** | Making an LLM answer questions using only provided source text, reducing hallucinations. RAG does this. |
| **hallucination** | When an LLM confidently states something false. RAG reduces this by giving the LLM real text to quote from. |
| **HTTP** | HyperText Transfer Protocol — the rules browsers and servers use to send data back and forth. |
| **HTTP status code** | A 3-digit number in every HTTP response: 200 = success, 404 = not found, 429 = too many requests, 500 = server error. |
| **JWT** | JSON Web Token — a signed, portable "ticket" the server issues after login. The frontend sends it on future requests to prove it's authenticated. |
| **LangChain** | A Python framework that chains together LLM calls, retrievers, and prompt templates into pipelines. |
| **LLM** | Large Language Model — an AI trained on massive text datasets that can generate human-sounding responses. Llama 3.3 70B is the one used here. |
| **lru_cache** | Python decorator that memoizes (caches) a function's return value. Used to load the FAISS index only once. |
| **middleware** | Code that runs on every request *before* it reaches your route handler. CORS is implemented as middleware. |
| **nearest-neighbor search** | Finding the vector in a database that is "closest" (most similar) to a query vector. FAISS does this. |
| **Pydantic** | A Python library for data validation using type hints. FastAPI uses it heavily. |
| **Promise** | A JavaScript object representing a future value — something that hasn't arrived yet but will. `async/await` makes Promises readable. |
| **prompt template** | A string with placeholders (like `{context}` and `{question}`) that gets filled in before being sent to an LLM. |
| **RAG** | Retrieval-Augmented Generation — a pattern where you first *retrieve* relevant text from a database, then *generate* an answer using that text as context. |
| **React** | A JavaScript library for building user interfaces out of reusable components. |
| **React hook** | A function starting with `use` (e.g., `useState`, `useEffect`) that gives components special powers like remembering values between renders. |
| **retriever** | The part of the RAG pipeline that searches the vector store and returns the top-k most relevant chunks. |
| **router** | In FastAPI, a `APIRouter` groups related endpoints together (e.g., all chat endpoints in `chat.py`). |
| **serialization** | Converting a Python object into JSON text that can be sent over the network. Pydantic handles this automatically. |
| **session_id** | A UUID string that identifies one conversation. The backend uses it to look up chat history. |
| **similarity threshold** | A minimum score (0.25 in this project) a retrieved chunk must meet. Chunks below it are rejected to prevent hallucinations. |
| **state (React)** | A value that React "remembers" between re-renders. When state changes, the UI automatically updates. |
| **top-k retrieval** | Asking FAISS: "give me the k most similar chunks to this query." PolicyIQ uses k=5 by default. |
| **UUID** | Universally Unique Identifier — a random 128-bit string used as a unique ID. Session IDs are UUIDs. |
| **vector** | A list of numbers. In this project, a 384-number list representing the meaning of a text chunk. |
| **vector store** | A database optimized for storing and searching embedding vectors. FAISS is the vector store used here. |
| **Vite** | A fast frontend build tool and dev server. Runs the React app locally at `http://localhost:5173`. |

---

## Notes for Later — Things to Investigate

These were noticed while reading the code but are **not blocking** anything. Flag them for a future cleanup pass.

1. **`TypingIndicator.jsx` is not used** — `Chat.jsx` has its own inline typing animation (the bouncing dots, lines 160–173). The standalone `TypingIndicator.jsx` component exists but is never imported anywhere. It's dead code. You could either delete it or refactor `Chat.jsx` to use it for consistency.

2. **Score metadata path mismatch** — In `pipeline.py` (line 460), source objects get `"score": meta.get("score")`. But in `retriever.py`, the score is set inside the `SanitizingRetriever` on the cloned metadata dict (line 68). This works correctly but is indirect — worth tracing carefully if you ever see `score: None` showing up in source cards.

3. **Port inconsistency in CORS** — `main.py` allows `localhost:3000`, `5173`, and `5174`. The `.env.local` points to `localhost:8000` for the API. The frontend Vite dev server runs on `5173` by default. The `3000` and `5174` entries appear to be defensive fallbacks from earlier development. No functional bug, but it's noisy.

4. **`FeedbackRequest.response` type** — In `schemas.py` line 71, `response: str` — but in `client.js` line 18, `response` is passed as a string (the LLM answer text). This is consistent but could be confusing since `response` usually means "HTTP response" in web contexts. A rename to `answer` would be clearer.

5. **In-memory session store** — `_sessions` in `pipeline.py` (line 54) is a plain Python dict. It is lost on every server restart and cannot be shared across multiple server processes. The code comments acknowledge this ("swap for Redis if running multi-worker Uvicorn") but it's worth knowing as a limitation.

6. **`indexing/parser.py` not covered** — The parser (which handles PDF text extraction including OCR fallback) is important but was not included in this first-pass curriculum. Covered in "What to Learn Next."

---

## What to Learn Next

After completing this curriculum, these are the 5 most valuable next topics, based on what exists in the codebase:

### 1. How the Index Gets Built — `indexing/` folder
You've seen retrieval, but not *how* the FAISS index was originally created. Follow the pipeline: `parser.py` (PDF → text, with OCR fallback via Tesseract) → `chunker.py` (text → overlapping chunks with metadata) → `embedder.py` (chunks → 384-dimensional vectors) → `build_index.py` (vectors → `index.faiss` + `index.pkl`). Running this yourself on a new PDF is a great hands-on exercise.

### 2. How New Documents Are Added — `indexing/update_index.py`
There is a separate `update_index.py` that adds new PDFs to the existing index without rebuilding from scratch. Understanding it teaches you about incremental indexing, the `document_registry.json` deduplication system, and why you can't just append to a FAISS file naively.

### 3. How the Admin Panel Works — `pages/Admin.jsx` + `routers/admin.py`
The admin panel lets authorized users upload new PDFs, delete existing ones, and view feedback logs. Tracing an admin upload through `admin.py` teaches you: JWT verification via `require_admin`, file handling with Python's `UploadFile`, and how the backend triggers `update_index.py` to re-index uploaded documents.

### 4. Deploying to Vercel + Render
`README.md` and `MIGRATION.md` describe how the frontend is deployed to Vercel and the backend to Render. Learning this teaches: environment variables in production, the difference between a static deployment and a persistent server, and why you pre-build the FAISS index locally instead of on the cloud.

### 5. Tuning Retrieval Quality
The three most impactful knobs in the system are: `k` in `get_retriever()` (how many chunks to fetch), `SIMILARITY_THRESHOLD` in `pipeline.py` (how relevant a chunk must be), and `chunk_size`/`chunk_overlap` in `chunker.py` (how the PDFs are cut up). Experimenting with these — and measuring their effect on answer quality using `policyiq_test_questions.txt` — is a great practical exercise.
