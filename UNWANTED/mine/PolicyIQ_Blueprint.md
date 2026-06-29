# PolicyIQ — Complete Project Blueprint v2.0

### A RAG-Based Document Intelligence System for Oil & Gas Regulatory Compliance

### Handoff-Ready for Antigravity

---

> **How to use this document**Every section that describes a file also contains a `### Prompt for AI` block. Copy that prompt exactly into your AI assistant to generate that file. Each prompt is self-contained — it includes all context needed.

---

## Table of Contents

 1. [Project Overview](#1-project-overview)
 2. [Problem Statement](#2-problem-statement)
 3. [Solution Architecture](#3-solution-architecture)
 4. [Full Technology Stack with Pinned Versions](#4-full-technology-stack-with-pinned-versions)
 5. [Complete File Structure](#5-complete-file-structure)
 6. [Phase-by-Phase Build Plan](#6-phase-by-phase-build-plan)
 7. [System Prompt Template](#7-system-prompt-template)
 8. [Key Configuration Parameters](#8-key-configuration-parameters)
 9. [Evaluation Harness](#9-evaluation-harness)
10. [Common Errors & Fixes](#10-common-errors--fixes)
11. [Deployment Guide](#11-deployment-guide)
12. [Resume & Portfolio Packaging](#12-resume--portfolio-packaging)
13. [Master Checklist](#13-master-checklist)

---

## 1. Project Overview

PolicyIQ is a domain-specific Retrieval-Augmented Generation (RAG) system that allows IOCL engineers and safety officers to query regulatory and compliance documents using plain English — and get accurate, cited answers in seconds instead of manually searching through hundreds of PDF pages.

The system indexes public oil and gas regulatory documents (OISD standards, PESO guidelines, MoPNG circulars, IOCL annual reports) into a FAISS vector store. At query time, the user's question is matched against the index, the most relevant document chunks are retrieved, and a hosted LLM (Groq LLaMA 3) generates a grounded answer with source document and section number cited.

**This is not a tutorial project.** It includes a production-grade ingestion pipeline, an admin panel for corpus management, a formal evaluation harness with a documented accuracy score, and a live deployment. Every architectural decision is intentional and resume-ready.

---

## 2. Problem Statement

IOCL operates under simultaneous regulatory frameworks — OISD, PESO, BIS, and MoPNG. Safety officers and engineers regularly need to answer compliance queries such as:

> *"What is the minimum safe distance between an LPG storage tank and a process unit per OISD-118?"*

The current process:

1. Open a 200-page PDF
2. Ctrl+F for keywords
3. Read through multiple sections
4. Hope the right clause was found
5. Repeat across 3–4 different documents

This takes 30–60 minutes per query. Multiply that across audits, inspections, and daily operational decisions — it is thousands of man-hours lost annually.

**PolicyIQ reduces this to 10 seconds.** With source citation included.

---

## 3. Solution Architecture

### 3.1 Two-Stage Pipeline

**Stage 1 — Offline Ingestion (runs locally on your machine, once)**

```
Public PDFs (OISD, PESO, IOCL, MoPNG)
        ↓
PDF Parsing: pdfplumber (digital) / pdf2image + Tesseract (scanned)
        ↓
Section Hierarchy Extraction (parent header metadata)
        ↓
Metadata-Enriched Chunking
[Context: Section 4 → 4.1.2 Water Storage] text...
        ↓
Embedding: sentence-transformers/all-MiniLM-L6-v2
        ↓
FAISS Index → index.faiss + index.pkl (committed to GitHub)
```

**Stage 2 — Online Query (runs on Hugging Face Spaces)**

```
User Query (plain English)
        ↓
Embed query using same sentence-transformer
        ↓
FAISS similarity search → top 5 chunks
        ↓
Chunks + metadata injected into LLM prompt
        ↓
Groq API (LLaMA 3) → Grounded answer
        ↓
Streamlit UI → Answer + Source Document + Section Number
```

### 3.2 Key Architectural Decisions

| Decision | What Was Rejected | Why This Was Chosen |
| --- | --- | --- |
| No FastAPI | Separate FastAPI + Streamlit | RAG logic as pure Python modules imported into Streamlit — eliminates CORS, double-container overhead |
| Pre-built FAISS index | Runtime indexing on HF Spaces | Free Spaces CPU crashes on heavy embedding jobs; index pre-built locally and committed to GitHub |
| Metadata-enriched chunking | Plain RecursiveCharacterTextSplitter | Regulatory documents have deep clause hierarchies — parent section headers injected into each chunk |
| 300 DPI OCR preprocessing | Raw Tesseract | Prevents decimal/number corruption in safety-critical documents (e.g. `l5 meters` instead of `15 meters`) |
| Single Streamlit app | Two separate portals | `st.navigation` handles Admin + Employee pages in one container — simpler deployment |
| SHA-256 deduplication | No deduplication | Prevents the same PDF being indexed twice if uploaded again via admin panel |
| Token-based admin auth | Plain session_state flag | `st.session_state` resets on refresh — token survives within tab session |
| Pinned dependency versions | `latest` everywhere | LangChain breaks constantly between versions — pinning is mandatory for reproducibility |
| Automated eval scoring | Manual Y/N scoring | Keyword-match scoring in `eval.py` produces a real number, not a claimed one |
| Groq retry with backoff | Single API call | Free tier rate limits hit under demo load — retry logic prevents visible errors |

---

## 4. Full Technology Stack with Pinned Versions

> **CRITICAL:** Never change these versions without testing. LangChain's import paths and APIs break between minor versions.

```
# requirements.txt — copy this exactly

# LangChain ecosystem — pinned tightly
langchain==0.2.16
langchain-community==0.2.16
langchain-core==0.2.38
langchain-groq==0.1.9
langchain-huggingface==0.0.3

# Vector store
faiss-cpu==1.8.0

# Embeddings
sentence-transformers==3.1.1

# PDF parsing
pdfplumber==0.11.4
pdf2image==1.17.0
pytesseract==0.3.13

# LLM provider
groq==0.11.0

# Frontend
streamlit==1.38.0

# Utilities
python-dotenv==1.0.1
tenacity==8.5.0
```

**Why these choices:**

- FAISS over ChromaDB/Pinecone: zero external service dependency, runs locally, index persists as files
- Groq over OpenAI: free tier is generous, LLaMA 3.3 70b is strong on instruction-following
- Streamlit over Flask: ships a full chat UI in \~50 lines, built-in components, HF Spaces support
- MiniLM over OpenAI embeddings: free, offline, no per-query API cost, adequate quality for technical documents
- `tenacity` for Groq retries: handles rate limit errors silently without crashing the UI

---

## 5. Complete File Structure

```
policyiq/
│
├── app.py                          # Streamlit entry point — st.navigation routing
│
├── pages/
│   ├── chat.py                     # Employee Chat Portal
│   └── admin.py                    # Admin Portal (token-gated)
│
├── rag/
│   ├── __init__.py
│   ├── retriever.py                # FAISS index loading + similarity search
│   ├── generator.py                # Groq API call + prompt + retry logic
│   └── pipeline.py                 # End-to-end ask(question) interface
│
├── indexing/
│   ├── __init__.py
│   ├── parser.py                   # PDF parsing — pdfplumber + pdf2image + Tesseract
│   ├── chunker.py                  # Metadata-enriched chunking logic
│   ├── embedder.py                 # Embedding generation with sentence-transformers
│   ├── deduplicator.py             # SHA-256 hash tracking to prevent duplicate indexing
│   ├── build_index.py              # Run once locally — builds full FAISS index
│   └── update_index.py             # Append new documents to existing FAISS index
│
├── data/
│   ├── raw/                        # Raw PDF documents (not committed to GitHub)
│   │   ├── oisd/
│   │   ├── peso/
│   │   ├── mopng/
│   │   └── iocl/
│   ├── indexed_hashes.json         # SHA-256 hashes of already-indexed PDFs
│   └── eval_set.json               # 20 hand-crafted Q&A pairs for evaluation
│
├── vector_store/
│   ├── index.faiss                 # Pre-built FAISS index (committed to GitHub)
│   └── index.pkl                   # Chunk metadata — source, page, section path
│
├── scripts/
│   └── eval.py                     # Automated evaluation script — keyword match scoring
│
├── notebooks/
│   └── eda.ipynb                   # EDA — chunk inspection, similarity search tests
│
├── requirements.txt                # Pinned dependencies (copy from Section 4 exactly)
├── .env                            # GROQ_API_KEY + ADMIN_PASSWORD (never commit)
├── .env.example                    # Template — commit this, not .env
├── .gitignore
└── README.md
```

---

## 6. Phase-by-Phase Build Plan

---

### Phase 0 — Environment Setup (Day 1)

**Goal:** Clean, reproducible dev environment before any code.

**Tasks:**

1. Create GitHub repo `policyiq` with full folder structure from Section 5

2. Set up Python 3.11 virtual environment:

   ```bash
   python3.11 -m venv venv
   source venv/bin/activate   # Mac/Linux
   venv\Scripts\activate      # Windows
   ```

3. Copy `requirements.txt` from Section 4 exactly and install:

   ```bash
   pip install -r requirements.txt
   ```

4. Verify Tesseract and poppler are installed:

   ```bash
   brew install tesseract poppler   # Mac
   sudo apt install tesseract-ocr poppler-utils   # Ubuntu/HF Spaces
   ```

5. Create `.env`:

   ```
   GROQ_API_KEY=gsk_...
   ADMIN_PASSWORD=yourpassword
   ```

6. Create `.env.example`:

   ```
   GROQ_API_KEY=your_groq_key_here
   ADMIN_PASSWORD=your_admin_password_here
   ```

7. Create `.gitignore`:

   ```
   .env
   venv/
   __pycache__/
   *.pyc
   .DS_Store
   data/raw/
   ```

   > **Note:** Do NOT add `vector_store/` to `.gitignore`. You need those files in GitHub for HF Spaces to load them.

8. Write README skeleton and commit

**End of phase deliverable:** Repo created, dependencies installed, `.env` working, `import langchain` succeeds

---

### Phase 1 — Document Collection & Parsing (Days 2–3)

**Goal:** Build a high-quality corpus. Answer quality is directly proportional to corpus quality.

**Document sources (all free, all public):**

| Document | Source |
| --- | --- |
| OISD-116 (Electrical) | oisd.co.in |
| OISD-118 (Tank Farm) | oisd.co.in |
| OISD-141 (Fire Protection) | oisd.co.in |
| OISD-150 (Loading/Unloading) | oisd.co.in |
| PESO Act | peso.gov.in |
| MoPNG Safety Guidelines | ppac.gov.in |
| IOCL Annual Report | iocl.com/investor |

**Tasks:**

1. Download 8–12 PDFs, name them meaningfully: `OISD_118_Tank_Farm_Safety.pdf`
2. Organize into subfolders: `data/raw/oisd/`, `data/raw/peso/`, etc.
3. Build `indexing/parser.py` (see prompt below)
4. Run all PDFs through parser, print 5 sample outputs, **manually inspect for OCR errors**
5. Fix document-specific issues: tables splitting incorrectly, multi-column layouts

**Chunking quality validation (mandatory before Phase 2):**

Run this after parsing to verify section hierarchy extraction is working:

```python
from indexing.parser import parse_document
from indexing.chunker import chunk_document

doc = parse_document("data/raw/oisd/OISD_118_Tank_Farm_Safety.pdf")
chunks = chunk_document(doc)

# Inspect first 10 chunks
for i, chunk in enumerate(chunks[:10]):
    print(f"--- CHUNK {i} ---")
    print(f"Section path: {chunk.metadata.get('section', 'MISSING')}")
    print(f"Source: {chunk.metadata.get('source', 'MISSING')}")
    print(f"Page: {chunk.metadata.get('page', 'MISSING')}")
    print(f"Text preview: {chunk.page_content[:200]}")
    print()
```

**Expected output:** Each chunk should show a section path like `Section 4 → 4.1.2 Water Storage`. If `section` shows `MISSING` or `Unknown` for more than 30% of chunks, the section hierarchy regex needs tuning for that document's formatting before proceeding.

**End of phase deliverable:** Clean structured text from all PDFs with page and section metadata intact, validation output reviewed

---

#### `indexing/parser.py`

### Prompt for AI:

```
Write a Python file at `indexing/parser.py` for a RAG system called PolicyIQ.

Requirements:
- Import: pdfplumber, pdf2image (convert_from_path), pytesseract, os, pathlib
- Function `is_scanned(pdf_path: str) -> bool`: opens PDF with pdfplumber, checks first 3 pages, returns True if average extracted text length is under 100 characters
- Function `parse_digital(pdf_path: str) -> list[dict]`: uses pdfplumber to extract text page by page. Returns list of dicts: {"text": str, "metadata": {"source": filename_without_extension, "page": page_number_1_indexed}}
- Function `parse_scanned(pdf_path: str) -> list[dict]`: uses convert_from_path at dpi=300, runs pytesseract.image_to_string on each PIL image. Returns same format as parse_digital. Include this line for Tesseract path on Linux/HF Spaces: pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'. Wrap in try/except — if tesseract binary not found, raise RuntimeError with a helpful message.
- Function `parse_document(pdf_path: str) -> list[dict]`: routes to parse_digital or parse_scanned based on is_scanned(). Prints which parser was used.
- Add a `if __name__ == "__main__"` block that parses all PDFs in data/raw/ recursively and prints the first 300 characters of each first page.
- Use pathlib throughout for path handling.
- Add a module-level docstring explaining this file's role in the pipeline.
```

---

#### `indexing/chunker.py`

### Prompt for AI:

```
Write a Python file at `indexing/chunker.py` for a RAG system called PolicyIQ.

Requirements:
- Imports: langchain_text_splitters (RecursiveCharacterTextSplitter), langchain_core.documents (Document), re
- Function `extract_section_hierarchy(text: str) -> str`: uses regex to detect section headers in OISD-style regulatory documents. Headers follow patterns like "4.", "4.1", "4.1.2", "Section 4", "SECTION 4". Returns the deepest matched header as a human-readable string like "Section 4.1.2". Returns "General" if no header found. Must handle both numeric (4.1.2) and text (SECTION 4 - FIRE PROTECTION) patterns.
- Function `inject_metadata_prefix(text: str, section_path: str, source: str) -> str`: prepends "[Context: {source} | {section_path}]\n" to the text. This makes the context visible to the LLM even when chunk boundaries cut through section breaks.
- Function `chunk_document(parsed_pages: list[dict], chunk_size: int = 800, chunk_overlap: int = 150) -> list[Document]`: takes output from parser.py (list of {"text", "metadata"} dicts). Concatenates all page text with page markers. Splits using RecursiveCharacterTextSplitter with chunk_size and chunk_overlap. For each chunk, calls extract_section_hierarchy, calls inject_metadata_prefix, and creates a LangChain Document with metadata: {"source": str, "page": int, "section": str}. Returns list of Documents.
- Add a `if __name__ == "__main__"` block that chunks OISD_118 and prints the first 10 chunks with their full metadata.
- Add a module-level docstring explaining why metadata injection matters for regulatory documents with deep clause hierarchies.
```

---

#### `indexing/deduplicator.py`

### Prompt for AI:

```
Write a Python file at `indexing/deduplicator.py` for a RAG system called PolicyIQ.

This module prevents the same PDF from being indexed multiple times — a critical safeguard for the admin upload panel.

Requirements:
- Imports: hashlib, json, pathlib, os
- HASHES_FILE constant: "data/indexed_hashes.json"
- Function `compute_sha256(file_path: str) -> str`: reads file in binary mode, computes and returns SHA-256 hex digest
- Function `load_hashes() -> dict`: loads HASHES_FILE if it exists, returns dict mapping filename -> sha256. Returns empty dict if file does not exist.
- Function `save_hashes(hashes: dict) -> None`: writes hashes dict to HASHES_FILE with indent=2
- Function `is_already_indexed(file_path: str) -> bool`: computes SHA-256 of file_path, checks if that hash exists in the loaded hashes dict. Returns True if already indexed.
- Function `mark_as_indexed(file_path: str) -> None`: computes SHA-256 of file_path, adds it to the hashes dict with the filename as key, saves the updated dict.
- Function `remove_from_index(file_path: str) -> None`: removes entry by filename from hashes dict (for future admin deletion feature).
- All functions must handle the case where data/ directory does not exist by creating it.
- Add a module-level docstring explaining the deduplication strategy.
```

---

#### `indexing/embedder.py`

### Prompt for AI:

```
Write a Python file at `indexing/embedder.py` for a RAG system called PolicyIQ.

Requirements:
- Imports: langchain_huggingface (HuggingFaceEmbeddings)
- MODEL_NAME constant: "sentence-transformers/all-MiniLM-L6-v2"
- Function `get_embedding_model() -> HuggingFaceEmbeddings`: initializes and returns HuggingFaceEmbeddings with model_name=MODEL_NAME and model_kwargs={"device": "cpu"}. The model downloads to ~/.cache/huggingface on first call — print a message warning the user the first run takes ~2 minutes to download the model.
- No other functions needed — embedding is handled by LangChain's FAISS.from_documents internally.
- Add a `if __name__ == "__main__"` block that initializes the model and embeds a test sentence ["fire safety minimum distance LPG storage"], prints the embedding shape.
- Add a module-level docstring explaining model choice: MiniLM-L6-v2 is 80MB, runs offline, no API cost, adequate for technical English documents.
```

---

#### `indexing/build_index.py`

### Prompt for AI:

```
Write a Python file at `indexing/build_index.py` for a RAG system called PolicyIQ.

This script is run ONCE locally to build the FAISS vector index. It must never be run on Hugging Face Spaces.

Requirements:
- Imports: pathlib, sys, os. Also import from indexing.parser, indexing.chunker, indexing.embedder, indexing.deduplicator, langchain_community.vectorstores (FAISS), dotenv (load_dotenv)
- Call load_dotenv() at the top
- RAW_DATA_DIR = Path("data/raw")
- VECTOR_STORE_DIR = Path("vector_store")
- Main logic:
  1. Find all .pdf files recursively under RAW_DATA_DIR
  2. Print total PDFs found
  3. For each PDF: call is_already_indexed — if True, print "SKIPPING {filename} (already indexed)" and continue. Otherwise: parse_document → chunk_document → mark_as_indexed
  4. Collect all chunks from all documents into one list
  5. If no chunks collected, print error and exit
  6. Print total chunk count
  7. embeddings = get_embedding_model()
  8. vectorstore = FAISS.from_documents(all_chunks, embeddings)
  9. VECTOR_STORE_DIR.mkdir(exist_ok=True)
  10. vectorstore.save_local(str(VECTOR_STORE_DIR))
  11. Print "Index built successfully. Files: vector_store/index.faiss, vector_store/index.pkl"
- Wrap everything in try/except, print clear error messages
- Add a `if __name__ == "__main__"` guard
- Add a module-level docstring: "Run this script once locally. Do NOT run on Hugging Face Spaces — it will crash the free-tier container."
```

---

#### `indexing/update_index.py`

### Prompt for AI:

```
Write a Python file at `indexing/update_index.py` for a RAG system called PolicyIQ.

This script appends a single new PDF to an existing FAISS index. It is called by the admin panel after upload.

Requirements:
- Imports: pathlib, sys, os. Import from indexing.parser, indexing.chunker, indexing.embedder, indexing.deduplicator, langchain_community.vectorstores (FAISS), dotenv (load_dotenv)
- Call load_dotenv() at the top
- VECTOR_STORE_DIR = Path("vector_store")
- Function `update_index(pdf_path: str) -> tuple[bool, str]`: returns (success: bool, message: str)
  1. Check if vector_store/index.faiss exists — if not, return (False, "No existing index found. Run build_index.py first.")
  2. Check is_already_indexed(pdf_path) — if True, return (False, f"{filename} is already in the index. Skipping to prevent duplicates.")
  3. parse_document(pdf_path) → chunk_document → collect chunks
  4. If no chunks, return (False, "No text could be extracted from this PDF.")
  5. embeddings = get_embedding_model()
  6. Load existing index: FAISS.load_local(str(VECTOR_STORE_DIR), embeddings, allow_dangerous_deserialization=True)
  7. vectorstore.add_documents(new_chunks)
  8. vectorstore.save_local(str(VECTOR_STORE_DIR))
  9. mark_as_indexed(pdf_path)
  10. Return (True, f"Successfully added {len(new_chunks)} chunks from {filename} to the index.")
- Add a `if __name__ == "__main__"` block that accepts a PDF path as sys.argv[1] and calls update_index()
```

---

### Phase 2 — FAISS Index Build (Day 4)

**Goal:** Build the vector index and verify retrieval quality.

**Tasks:**

1. Run `python indexing/build_index.py`
2. Verify `vector_store/index.faiss` and `vector_store/index.pkl` exist
3. Test retrieval quality:

   ```python
   from langchain_community.vectorstores import FAISS
   from indexing.embedder import get_embedding_model
   
   embeddings = get_embedding_model()
   vectorstore = FAISS.load_local("vector_store/", embeddings, allow_dangerous_deserialization=True)
   retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
   
   results = retriever.invoke("minimum safe distance LPG storage tank")
   for doc in results:
       print(doc.metadata)
       print(doc.page_content[:300])
       print("---")
   ```
4. **Expected:** All 5 results should have `section` metadata, `source` should match a real document name, content should visibly relate to the query
5. If results are irrelevant: reduce `chunk_size` to 600, increase `chunk_overlap` to 200 in `chunker.py`, delete `vector_store/`, rebuild
6. Commit `vector_store/index.faiss` and `vector_store/index.pkl` to GitHub

**End of phase deliverable:** FAISS index committed to GitHub, retrieval returning relevant chunks with metadata

---

### Phase 3 — RAG Pipeline Core (Days 5–6)

**Goal:** Build the end-to-end retrieval + generation pipeline. This is the intellectual core.

---

#### `rag/retriever.py`

### Prompt for AI:

```
Write a Python file at `rag/retriever.py` for a RAG system called PolicyIQ.

Requirements:
- Imports: langchain_community.vectorstores (FAISS), langchain_huggingface (HuggingFaceEmbeddings), pathlib
- VECTOR_STORE_DIR = Path("vector_store")
- MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
- Function `get_retriever(k: int = 5)`: 
  1. Initialize HuggingFaceEmbeddings with model_name=MODEL_NAME, model_kwargs={"device": "cpu"}
  2. Check if VECTOR_STORE_DIR / "index.faiss" exists — if not, raise FileNotFoundError with message "FAISS index not found. Run indexing/build_index.py first."
  3. Load: FAISS.load_local(str(VECTOR_STORE_DIR), embeddings, allow_dangerous_deserialization=True). This is safe — we built the index ourselves.
  4. Return vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": k})
- Add module-level docstring.
```

---

#### `rag/generator.py`

### Prompt for AI:

```
Write a Python file at `rag/generator.py` for a RAG system called PolicyIQ.

Requirements:
- Imports: langchain_groq (ChatGroq), os, dotenv (load_dotenv), tenacity (retry, stop_after_attempt, wait_exponential, retry_if_exception_type), groq (RateLimitError)
- Call load_dotenv() at the top
- MODEL_NAME = "llama-3.3-70b-versatile"
- SYSTEM_PROMPT string (see Section 7 of this blueprint for the exact text — copy it verbatim)
- Function `load_llm() -> ChatGroq`:
  1. api_key = os.getenv("GROQ_API_KEY") — if None or empty, raise ValueError("GROQ_API_KEY not set in .env")
  2. Return ChatGroq(model=MODEL_NAME, temperature=0.2, max_tokens=1024, api_key=api_key)
- Decorator for retry: use @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), retry=retry_if_exception_type(RateLimitError), reraise=True)
- Apply this decorator to a function `invoke_with_retry(chain, query: dict) -> dict` that calls chain.invoke(query) and returns the result. If all 3 retries fail, raise RuntimeError("Groq API rate limit exceeded after 3 retries. Wait 60 seconds and try again.")
- Add module-level docstring explaining why retry logic is needed (Groq free tier: 30 requests/minute, 6000 tokens/minute).
```

---

#### `rag/pipeline.py`

### Prompt for AI:

```
Write a Python file at `rag/pipeline.py` for a RAG system called PolicyIQ.

Requirements:
- Imports: langchain.chains (RetrievalQA), langchain_core.prompts (PromptTemplate), streamlit (st), from rag.retriever import get_retriever, from rag.generator import load_llm, SYSTEM_PROMPT, invoke_with_retry, dotenv (load_dotenv)
- Call load_dotenv() at the top
- @st.cache_resource decorated function `build_chain()`:
  1. prompt = PromptTemplate(template=SYSTEM_PROMPT, input_variables=["context", "question"])
  2. chain = RetrievalQA.from_chain_type(llm=load_llm(), chain_type="stuff", retriever=get_retriever(k=5), return_source_documents=True, chain_type_kwargs={"prompt": prompt})
  3. Return chain
  The @st.cache_resource decorator means this function runs ONCE per Streamlit session, not on every query. Critical for performance.
- Function `ask(question: str) -> dict`:
  1. chain = build_chain()
  2. result = invoke_with_retry(chain, {"query": question})
  3. sources = [{"source": doc.metadata.get("source", "Unknown"), "page": doc.metadata.get("page", "N/A"), "section": doc.metadata.get("section", ""), "preview": doc.page_content[:300]} for doc in result["source_documents"]]
  4. Return {"answer": result["result"], "sources": sources}
- Add a `if __name__ == "__main__"` CLI test block: ask("What is the minimum safe distance for LPG storage near a process unit?") and pretty-print result
- Add module-level docstring.
```

---

**After building the pipeline, run these tests from CLI before touching the UI:**

```bash
python rag/pipeline.py
```

Manual test checklist:

- `ask("What is the minimum safe distance for LPG storage near a process unit?")` → answer should reference OISD, include a number
- `ask("What is the inspection interval for fire hydrant systems?")` → should cite a document and section
- `ask("What is the GDP of India?")` → MUST return the exact refusal message, not a number
- `ask("Who is the CEO of IOCL?")` → MUST return the refusal message
- `ask("What pressure limits apply to petroleum pipelines per OISD-141?")` → should return numerical value with citation

If any of the first two fail: retrieval problem — re-check FAISS index. If the refusal tests fail: system prompt problem — lower temperature to 0.0, strengthen Rule 1.

---

### Phase 4 — Streamlit App (Days 7–8)

---

#### `app.py`

### Prompt for AI:

```
Write a Python file at `app.py` for a Streamlit application called PolicyIQ.

Requirements:
- Imports: streamlit as st, dotenv (load_dotenv)
- Call load_dotenv() as the very first line after imports — before any other code
- st.set_page_config(page_title="PolicyIQ | IOCL Compliance Assistant", page_icon="🔍", layout="wide")
- Define pages dict:
  pages = {
    "Employee Portal": [st.Page("pages/chat.py", title="PolicyIQ Chat", icon="💬")],
    "Administration": [st.Page("pages/admin.py", title="Admin Panel", icon="⚙️")],
  }
- pg = st.navigation(pages)
- pg.run()
- Add a comment explaining that load_dotenv() MUST be called here before any rag/ module imports, because those modules read GROQ_API_KEY on import.
```

---

#### `pages/chat.py`

### Prompt for AI:

```
Write a Python file at `pages/chat.py` for a Streamlit application called PolicyIQ.

This is the main employee-facing chat interface.

Requirements:
- Imports: streamlit as st, from rag.pipeline import ask, build_chain
- Page title: st.title("🔍 PolicyIQ — IOCL Compliance Assistant")
- Subtitle: st.caption("Ask compliance questions in plain English. Answers are grounded in indexed OISD, PESO, and MoPNG documents.")
- Sidebar contents:
  - st.sidebar.header("System Status")
  - st.sidebar.success("✅ Index loaded") if build_chain() doesn't raise, else st.sidebar.error("❌ Index not found")
  - st.sidebar.markdown("**Active model:** LLaMA 3.3 70b (Groq)")
  - st.sidebar.markdown("**Embedding model:** all-MiniLM-L6-v2")
  - st.sidebar.divider()
  - Button "🗑️ Clear conversation" that resets st.session_state.messages = []
- Session state: initialize st.session_state.messages = [] if not present
- Chat history display: loop over st.session_state.messages, render each with st.chat_message(role)
- st.chat_input("Ask a compliance question..."):
  - Add user message to session state, display it
  - Show st.spinner("Searching documents and generating answer...")
  - Call ask(prompt) inside try/except RuntimeError (catches Groq rate limit error) and generic Exception
  - On success: append assistant message, display it with st.chat_message("assistant")
  - Below the answer: st.expander("📄 View source documents") showing a table with columns: Source, Page, Section, Preview (first 200 chars)
  - On RuntimeError: show st.warning with the rate limit message
  - On generic Exception: show st.error("An error occurred: {e}")
- Add a module-level docstring.
```

---

#### `pages/admin.py`

### Prompt for AI:

```
Write a Python file at `pages/admin.py` for a Streamlit application called PolicyIQ.

This is the admin panel for uploading new regulatory PDFs to the corpus.

IMPORTANT CONSTRAINT: This panel must work on Hugging Face Spaces free tier, which has NO persistent storage. Uploaded PDFs cannot be saved permanently to disk. The solution: save uploaded files to a temp directory within the session, run update_index.py on them, commit the updated index to GitHub separately. This file must acknowledge this limitation clearly in the UI.

Requirements:
- Imports: streamlit as st, os, tempfile, pathlib (Path), from indexing.update_index import update_index, from indexing.deduplicator import load_hashes
- Token-based authentication (NOT plain session_state flag, which resets on refresh):
  - If "admin_token" not in st.session_state: st.session_state.admin_token = None
  - Show login form if st.session_state.admin_token is None:
    - st.title("⚙️ Admin Panel")
    - password = st.text_input("Admin password", type="password")
    - If st.button("Login"):
      - Correct password (os.getenv("ADMIN_PASSWORD")): set st.session_state.admin_token = "authenticated", st.rerun()
      - Wrong password: st.error("Incorrect password")
  - Show admin panel if st.session_state.admin_token == "authenticated":
    - Logout button that sets st.session_state.admin_token = None, st.rerun()
    - st.title("⚙️ Admin Panel — Document Management")
    - st.info("⚠️ HF Spaces Note: Uploads are processed in a temporary session directory. After uploading, the updated index files (vector_store/) must be committed to GitHub for changes to persist across app restarts.")
    - st.subheader("Upload New Documents")
    - File uploader: type=["pdf"], accept_multiple_files=True
    - On upload: for each file, save to a tempfile.NamedTemporaryFile, call update_index(tmp_path), display st.success or st.error based on return value
    - st.subheader("Currently Indexed Documents")
    - Load hashes from load_hashes(), display as st.dataframe with columns: Filename, SHA-256 (first 12 chars)
    - If no documents indexed: st.info("No documents indexed yet. Run build_index.py locally first.")
- Add a module-level docstring explaining the HF Spaces storage limitation.
```

---

### Phase 5 — Evaluation & Tuning (Days 9–10)

**Goal:** Produce a real, measured accuracy score. Do not claim a number before running this.

---

#### `data/eval_set.json`

### Prompt for AI:

```
Generate a JSON file at `data/eval_set.json` for evaluating a RAG system called PolicyIQ.

The system indexes OISD (Oil Industry Safety Directorate) standards, PESO Act, and MoPNG safety guidelines for Indian Oil Corporation Limited (IOCL).

Create exactly 20 evaluation questions covering 5 query types (4 questions each):

1. factual_recall: Questions asking for specific regulatory values, distances, or requirements (e.g., minimum distances, required frequencies, mandatory equipment)
2. compliance_check: Questions asking whether something is mandatory or permitted under a specific standard
3. multi_document: Questions where the complete answer spans two different OISD standards
4. numerical: Questions asking for exact numerical thresholds, pressures, capacities, or dimensions
5. out_of_scope: Questions completely outside the document corpus (stock prices, general knowledge, current events)

For each question, include:
- "id": integer 1-20
- "query_type": one of the 5 types above
- "question": the plain English question
- "expected_keywords": array of 2-4 keywords that a correct answer must contain (lowercase). For out_of_scope, use ["not found in the indexed documents"].
- "expected_source_contains": partial document name that should appear in sources (e.g., "OISD_118"). Null for out_of_scope.
- "notes": one sentence explaining what a correct answer looks like

Make the questions specific and realistic — the kind a IOCL safety officer would actually ask during an audit. Do not invent specific clause numbers or values — keep questions general enough that real OISD documents would contain the answers.

Output valid JSON only, no markdown, no preamble.
```

---

#### `scripts/eval.py`

### Prompt for AI:

```
Write a Python file at `scripts/eval.py` for evaluating a RAG system called PolicyIQ.

This script runs all 20 evaluation questions through the pipeline automatically and produces a scored CSV — no manual Y/N needed.

Requirements:
- Imports: json, csv, pathlib (Path), sys, os. sys.path.insert(0, str(Path(__file__).parent.parent)) to allow imports from project root. from rag.pipeline import ask. from dotenv import load_dotenv. load_dotenv().
- EVAL_SET_PATH = Path("data/eval_set.json")
- OUTPUT_PATH = Path("eval_results.csv")
- Scoring function `score_answer(answer: str, sources: list, expected_keywords: list, expected_source_contains: str | None) -> tuple[bool, bool]`:
  - answer_correct: True if ALL expected_keywords appear in answer.lower()
  - source_correct: True if expected_source_contains is None (out_of_scope) OR if any source["source"].lower() contains expected_source_contains.lower()
  - Return (answer_correct, source_correct)
- Main loop:
  1. Load eval_set.json
  2. Print "Running PolicyIQ evaluation — 20 queries"
  3. For each question: print progress "Query {id}/20: {question[:60]}..."
  4. Call ask(question), catch exceptions — on exception, record answer_correct=False, source_correct=False, answer="ERROR: {e}"
  5. Call score_answer
  6. Collect results
- Write to eval_results.csv with columns: id, query_type, question, answer_correct, source_correct, answer_preview (first 200 chars), sources_returned
- Print summary table:
```

=== EVALUATION RESULTS === Query Type | N | Answer Acc | Source Acc factual_recall | 4 | X/4 (XX%) | X/4 (XX%) compliance_check | 4 | ... multi_document | 4 | ... numerical | 4 | ... out_of_scope | 4 | ... OVERALL | 20 | X/20 (XX%) | X/20 (XX%)

```
- Print "Results saved to eval_results.csv"
- Add a module-level docstring: "Run this script after building the index to measure actual accuracy. Do not report numbers from this file without running it."
```

**After running** `python scripts/eval.py`**:**

- Open `eval_results.csv` and read every `False` row
- Look for patterns: is it always the same document? Same query type?
- Apply fixes from the tuning guide below
- Rebuild index if chunk parameters changed
- Rerun eval until no obvious pattern in failures

**Tuning guide:**

| Problem | Diagnosis | Fix |
| --- | --- | --- |
| Wrong chunks retrieved | chunk_size too large | Reduce to 600, increase overlap to 200, rebuild index |
| Missing relevant content | k too low | Increase retriever k from 5 to 7 in `retriever.py` |
| LLM hallucinating | Temperature too high or weak prompt | Set temperature=0.0, strengthen Rule 1 in system prompt |
| Sources not cited in answer | Prompt not enforcing citation | Add "VIOLATION: any answer without \[Source:\] citation is invalid" to system prompt |
| Out-of-scope not handled | Prompt refusal rule too weak | Add "If any doubt whether context contains the answer, use the refusal message." |
| accuracy_correct True but answer is wrong | Keywords too generic | Update expected_keywords in eval_set.json to be more specific |

**End of phase deliverable:** `eval_results.csv` with real measured numbers. Update README with actual results table.

---

### Phase 6 — Deployment (Day 11)

**Goal:** Live deployed app on Hugging Face Spaces with complete documentation.

**Pre-deployment checklist:**

- [ ] `vector_store/index.faiss` and `vector_store/index.pkl` committed to GitHub

- [ ] `data/indexed_hashes.json` committed to GitHub

- [ ] `.env` is NOT committed (check with `git status`)

- [ ] `requirements.txt` matches Section 4 exactly

- [ ] App runs cleanly with `streamlit run app.py` locally

**Deployment steps:**

1. Go to huggingface.co/spaces → Create new Space → SDK: Streamlit
2. Connect to your GitHub repo
3. Settings → Repository Secrets: add `GROQ_API_KEY` and `ADMIN_PASSWORD`
4. Push code — Space builds automatically

**Handling FAISS index size on HF Spaces:**

If `vector_store/` is under 25MB total: commit both files → app loads on startup. Done.

If over 25MB: add this to `app.py` before `st.navigation`:

```python
import os
from pathlib import Path
if not Path("vector_store/index.faiss").exists():
    st.info("⏳ First-time setup: building index... (~3 minutes)")
    exit_code = os.system("python indexing/build_index.py")
    if exit_code != 0:
        st.error("Index build failed. Check logs.")
        st.stop()
    st.rerun()
```

**HF Spaces free tier limits:**

| Limitation | Impact | Status |
| --- | --- | --- |
| CPU-only | Embedding slower | ✅ Not an issue — index is pre-built, only query embeddings at runtime |
| 16GB RAM | Large models OOM | ✅ Not an issue — MiniLM is 80MB |
| Sleep after inactivity | 30s cold start on first query | ⚠️ Acceptable for portfolio demo |
| No persistent storage | Index resets on redeploy | ✅ Handled — index committed to GitHub |
| Admin uploads don't persist | New PDFs lost on restart | ⚠️ Known limitation — documented in admin panel UI |

---

## 7. System Prompt Template

Copy this exactly into `rag/generator.py` as the `SYSTEM_PROMPT` string.

```
You are PolicyIQ, an AI assistant for IOCL (Indian Oil Corporation Limited) safety and compliance document queries.

RULES — follow all of these strictly and without exception:

1. Answer ONLY from the provided document context below. Under no circumstances use your training knowledge to answer. If the provided context does not contain enough information, use the refusal message in Rule 3. There are no exceptions to this rule.

2. Every answer must cite the source document name and page number in this exact format: [Source: DOCUMENT_NAME, Page: X]. An answer without this citation is invalid.

3. If the answer is not present in the provided context, respond with exactly this message and nothing else: "This information is not found in the indexed documents. Please consult the relevant OISD/PESO guidelines directly."

4. Be concise and precise. Format numerical values, distances, pressures, and safety limits clearly. Use bullet points for multi-part answers.

5. If the query involves multiple documents, cite each source separately on a new line.

6. Never say "based on my knowledge" or "I believe" — only state what the provided context says.

Context:
{context}

Question: {question}

Answer:
```

---

## 8. Key Configuration Parameters

| Parameter | Recommended | Range | Effect |
| --- | --- | --- | --- |
| `chunk_size` | 800 | 600–1200 | Larger = more context per chunk. Smaller = more precise matching. Start at 800, reduce if retrieval is poor. |
| `chunk_overlap` | 150 | 100–250 | Higher reduces information loss at chunk boundaries. Increase if answers are cut off mid-clause. |
| `retriever k` | 5 | 3–8 | Lower = faster, more precise. Higher = better recall for complex queries. |
| `temperature` | 0.2 | 0.0–0.4 | Lower = more deterministic. For compliance queries, use 0.0–0.2. Never above 0.3. |
| `max_tokens` | 1024 | 512–2048 | 1024 is sufficient for most compliance answers. |
| `embed model` | all-MiniLM-L6-v2 | mpnet-base-v2 | mpnet is stronger but 5x larger and slower. Not needed for this corpus size. |

**Start with recommended values. Only tune after running** `eval.py` **and seeing failure patterns. Change one parameter at a time.**

---

## 9. Evaluation Harness

### 9.1 Evaluation philosophy

PolicyIQ uses keyword-match scoring rather than LLM-as-judge or manual Y/N:

- **Reproducible:** Anyone can rerun `eval.py` and get the same number
- **Honest:** No human bias in marking
- **Documented:** `eval_results.csv` is a verifiable artifact

The tradeoff: keyword match is a lower bound. A correct answer phrased differently might score False. This is acceptable for a portfolio project — conservative scoring is more credible than generous scoring.

### 9.2 What to put in README results table

Run `python scripts/eval.py`, then copy the printed summary table into README exactly as-is with the actual numbers. Do not modify or round up.

Example format (your numbers will differ):

```
| Query Type        | N  | Answer Accuracy | Source Accuracy |
|-------------------|----|-----------------|-----------------|
| Factual recall    |  4 | X/4 (XX%)       | X/4 (XX%)       |
| Compliance check  |  4 | X/4 (XX%)       | X/4 (XX%)       |
| Multi-document    |  4 | X/4 (XX%)       | X/4 (XX%)       |
| Numerical         |  4 | X/4 (XX%)       | X/4 (XX%)       |
| Out-of-scope      |  4 | X/4 (XX%)       | N/A             |
| **Overall**       | 20 | **X/20 (XX%)**  | **X/16 (XX%)**  |
```

**Do not fill in numbers until you have run the script.**

---

## 10. Common Errors & Fixes

### Error 1: `ImportError: cannot import name 'X' from 'langchain'`

**Cause:** Wrong LangChain version or wrong subpackage. **Fix:** Verify your installed versions match `requirements.txt` exactly:

```bash
pip show langchain langchain-community langchain-core langchain-groq langchain-huggingface
```

If any version differs, pin it: `pip install langchain==0.2.16 --force-reinstall`

---

### Error 2: `allow_dangerous_deserialization` required

**Where:** `retriever.py` when calling `FAISS.load_local()`**Fix:** Pass the argument explicitly:

```python
FAISS.load_local("vector_store/", embeddings, allow_dangerous_deserialization=True)
```

This is safe — you built the index. LangChain added this guard for untrusted pickle files.

---

### Error 3: `GROQ_API_KEY not found` or `None`

**Where:** `generator.py`**Fix:** Call `load_dotenv()` at the very top of `app.py` before any other import. The `.env` file must be in the project root, not in a subfolder.

---

### Error 4: Streamlit re-embeds the entire index on every query

**Symptom:** Every query takes 30+ seconds, CPU spikes **Fix:** Verify `@st.cache_resource` decorator is on `build_chain()` in `pipeline.py`. This is the most common performance bug.

---

### Error 5: Retrieved chunks are irrelevant to the query

**Diagnosis:** Chunking parameters too large or section hierarchy extraction failing silently. **Fix:**

1. Run the chunking validation block from Phase 1 on a test document
2. If `section` metadata is `General` for everything: the regex in `chunker.py` doesn't match that document's formatting — add document-specific patterns
3. Reduce `chunk_size` to 600, increase `chunk_overlap` to 200, delete `vector_store/`, rebuild

---

### Error 6: LLM answers questions outside the corpus (hallucination)

**Diagnosis:** System prompt not strict enough, or temperature too high. **Fix:**

1. Set `temperature=0.0` in `generator.py`
2. Add to system prompt Rule 1: *"There are no exceptions. Do not answer from training knowledge even if you are confident."*
3. Rerun the out-of-scope eval questions to verify

---

### Error 7: `pdf2image` fails — poppler not found

**Fix:**

```bash
brew install poppler        # Mac
sudo apt install poppler-utils  # Ubuntu/Linux
```

---

### Error 8: Tesseract not found

**Fix:**

```bash
brew install tesseract      # Mac
sudo apt install tesseract-ocr  # Ubuntu/Linux
```

And in `parser.py`:

```python
pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'   # Linux
pytesseract.pytesseract.tesseract_cmd = '/usr/local/bin/tesseract'  # Mac (Intel)
pytesseract.pytesseract.tesseract_cmd = '/opt/homebrew/bin/tesseract'  # Mac (Apple Silicon)
```

---

### Error 9: HF Spaces app crashes on startup (OOM or timeout)

**Cause:** Index being rebuilt at runtime — too heavy for free tier CPU. **Fix:** Ensure `index.faiss` and `index.pkl` are committed to GitHub and the app loads them directly. Never rebuild the index on HF Spaces unless you have no other option.

---

### Error 10: Same PDF indexed twice after admin upload

**Cause:** `deduplicator.py` not being called, or `indexed_hashes.json` not persisted. **Fix:** Verify `update_index.py` calls `is_already_indexed()` before processing and `mark_as_indexed()` after. Verify `indexed_hashes.json` is committed to GitHub.

---

### Error 11: Admin panel loses authentication on page refresh

**Cause:** `st.session_state` resets on full page reload. **Fix:** The admin panel uses a token string (`st.session_state.admin_token = "authenticated"`) which persists within a tab session but not across full reloads. This is by design — it's a security property, not a bug. Users must re-enter their password after closing and reopening the tab.

---

### Error 12: Groq rate limit error visible to users

**Cause:** Free tier token-per-minute limit hit. **Fix:** `generator.py` uses `tenacity` retry with exponential backoff — 3 retries, 2–10 second waits. If this still fails, the `RuntimeError` is caught in `chat.py` and shown as `st.warning` instead of a crash.

---

## 11. Deployment Guide

### 11.1 Local development

```bash
git clone https://github.com/yourusername/policyiq
cd policyiq
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Fill in GROQ_API_KEY and ADMIN_PASSWORD
python indexing/build_index.py   # Run once — builds FAISS index (~5 min)
streamlit run app.py
```

### 11.2 Adding new documents (local)

1. Place new PDF in `data/raw/` appropriate subfolder
2. Run: `python indexing/update_index.py data/raw/oisd/NEW_DOCUMENT.pdf`
3. Commit updated `vector_store/` files to GitHub

### 11.3 Adding new documents (via admin panel on HF Spaces)

1. Upload PDF via admin panel
2. Panel runs `update_index()` in the session's temp directory
3. Download updated `vector_store/` files from the Space
4. Commit them to GitHub
5. Push → Space rebuilds with new index

### 11.4 Hugging Face Spaces setup

1. huggingface.co/spaces → New Space → Streamlit
2. Connect GitHub repo
3. Settings → Secrets: `GROQ_API_KEY`, `ADMIN_PASSWORD`
4. Push → auto-build
5. Test on 3 devices

### 11.5 Total cost

| Component | Tool | Cost |
| --- | --- | --- |
| LLM API | Groq free tier | ₹0 |
| Embeddings | sentence-transformers local | ₹0 |
| Vector store | FAISS files in GitHub | ₹0 |
| App hosting | Hugging Face Spaces free tier | ₹0 |
| **Total** |  | **₹0** |

---

## 12. Resume & Portfolio Packaging

### 12.1 Resume bullet (short)

> PolicyIQ: Built RAG-based document intelligence system for IOCL compliance queries using LangChain, FAISS, Groq LLaMA 3, and Streamlit. Achieved \[X\]% answer accuracy on 20-query domain evaluation. Deployed on Hugging Face Spaces.

*Fill in \[X\] after running* `eval.py`*. Do not use a placeholder.*

### 12.2 Resume bullet (detailed)

> Built PolicyIQ, an end-to-end RAG system making IOCL's regulatory corpus (OISD, PESO, MoPNG) queryable via natural language. Implemented metadata-enriched chunking to preserve regulatory clause hierarchy, SHA-256 deduplication for corpus integrity, Groq API retry logic for production reliability, and a formal automated evaluation harness. Achieved \[X\]% answer accuracy on 20-question domain benchmark. Stack: pdfplumber, pdf2image, Tesseract, FAISS, sentence-transformers, LangChain 0.2.16, Groq LLaMA 3.3 70b, Streamlit.

### 12.3 Interview explanation (30 seconds)

> "PolicyIQ is a RAG system that makes IOCL's regulatory document corpus queryable. I built a two-stage pipeline: offline, PDFs are parsed with pdfplumber and OCR, chunked with parent section metadata injected into each chunk to preserve regulatory clause hierarchy, embedded using MiniLM, and stored in a FAISS index. At query time, the user's question is embedded, the 5 most relevant chunks are retrieved, and those are passed as context to LLaMA 3 via Groq to generate a cited answer. I automated evaluation with keyword-match scoring across 20 domain-specific queries, achieving \[X\]% accuracy, and deployed it on HF Spaces."

### 12.4 Key skills this project demonstrates

- **NLP & GenAI:** RAG pipeline, vector embeddings, prompt engineering, LLM evaluation
- **LangChain:** document loaders, text splitters, vector stores, RetrievalQA chain
- **MLOps thinking:** offline indexing vs online query separation, pinned dependencies, persisted artifacts
- **Software engineering:** modular Python, deduplication, retry logic, environment management
- **Product thinking:** admin panel, eval harness, live deployment, documented limitations

### 12.5 LinkedIn post template

> Built PolicyIQ during my internship at IOCL — a RAG-based compliance assistant that makes India's oil & gas regulatory corpus (OISD, PESO, MoPNG) queryable via plain English.
>
> Problem: safety engineers spend 30–60 minutes searching PDFs for compliance answers. PolicyIQ does it in 10 seconds with source citations.
>
> Stack: LangChain + FAISS + Groq (LLaMA 3) + Streamlit Evaluation: \[X\]% accuracy on 20-question domain benchmark (automated keyword scoring) Deployment: Live on Hugging Face Spaces
>
> #RAG #NLP #GenAI #LangChain #IOCL #MLInternship

---

## 13. Master Checklist

### Phase 0 — Setup

- [ ] GitHub repo with full folder structure

- [ ] Python 3.11 virtual environment active

- [ ] `requirements.txt` from Section 4 installed exactly

- [ ] `import langchain; import langchain_community; import langchain_groq` all succeed

- [ ] `.env` created with `GROQ_API_KEY` and `ADMIN_PASSWORD`

- [ ] `.gitignore` includes `.env`, `venv/`, `data/raw/`

- [ ] `vector_store/` is NOT in `.gitignore`

- [ ] README skeleton committed

### Phase 1 — Data & Parsing

- [ ] 8–12 PDFs downloaded, named meaningfully, organized in subfolders

- [ ] `indexing/parser.py` written

- [ ] All PDFs parsed, 5 sample outputs manually inspected

- [ ] Chunking validation block run on at least 2 OISD documents

- [ ] `section` metadata present in &gt;70% of chunks from each document

### Phase 2 — FAISS Index

- [ ] `indexing/chunker.py` with metadata injection written

- [ ] `indexing/deduplicator.py` written

- [ ] `indexing/embedder.py` written

- [ ] `indexing/build_index.py` run successfully

- [ ] `vector_store/index.faiss` and `vector_store/index.pkl` exist

- [ ] Both files committed to GitHub

- [ ] Manual retrieval test: 5 queries return relevant chunks with metadata

- [ ] `indexed_hashes.json` exists and committed

### Phase 3 — RAG Pipeline

- [ ] `rag/retriever.py` loads FAISS index without error

- [ ] `rag/generator.py` has retry logic and initializes ChatGroq

- [ ] System prompt from Section 7 copied exactly

- [ ] `rag/pipeline.py` builds RetrievalQA with `return_source_documents=True`

- [ ] `ask()` returns structured dict with answer and sources

- [ ] CLI test: 3 in-scope queries return answers with citations

- [ ] CLI test: 2 out-of-scope queries return exact refusal message

### Phase 4 — Streamlit UI

- [ ] `app.py` entry point with `load_dotenv()` as first call

- [ ] `pages/chat.py` working locally with session state and source expander

- [ ] `pages/admin.py` with token-based auth and HF Spaces limitation notice

- [ ] Admin PDF upload calls `update_index()` and shows success/error

- [ ] Full UI end-to-end test: 5 regulatory queries through the UI

### Phase 5 — Evaluation

- [ ] `data/eval_set.json` with 20 questions (4 per query type)

- [ ] `scripts/eval.py` runs all 20 queries automatically

- [ ] `eval_results.csv` generated with real numbers

- [ ] Tuning done if answer accuracy below 70%

- [ ] Actual evaluation results table added to README

### Phase 6 — Deployment

- [ ] App live on Hugging Face Spaces

- [ ] `GROQ_API_KEY` and `ADMIN_PASSWORD` set as HF Secrets

- [ ] Index loading correctly on startup (no rebuild happening)

- [ ] App tested on laptop, phone, different browser

- [ ] README complete with architecture, actual eval results, setup guide, live link

- [ ] Resume bullet updated with real accuracy number from eval

- [ ] LinkedIn post published