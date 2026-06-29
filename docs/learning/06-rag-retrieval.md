# Stage 6 — RAG Pipeline: Retrieval

> **Where we are in the flow:**  
> `pipeline.py calls chain.invoke() → retriever.py searches FAISS for matching chunks`

---

## Architecture Diagram — Stage 6

```
╔══════════════════════════════════════════════════════════════════╗
║                  BACKEND (retriever.py)                          ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/retriever.py              ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  get_retriever()                                         ║   ║
║   │    ├─ Loads FAISS index from disk (cached)               ║   ║
║   │    └─ Returns a LangChain Retriever object               ║   ║
║   │                                                          ║   ║
║   │  SanitizingRetriever._get_relevant_documents(query)      ║   ║
║   │    │                                                     ║   ║
║   │    ├─ 1. Embed Query: "LPG safe distance" → [0.1, -0.4...]║   ║
║   │    │                                                     ║   ║
║   │    ├─ 2. Search FAISS: Find top K closest vectors        ║   ║
║   │    │     <────── reads vector_store/index.faiss ──────>  ║   ║
║   │    │                                                     ║   ║
║   │    ├─ 3. Target Queries (Query Expansion)                ║   ║
║   │    │     If query has "peso" → search "PESO rules" too   ║   ║
║   │    │                                                     ║   ║
║   │    └─ 4. Return chunks (text + metadata) to pipeline     ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## What This Stage Does and WHY It Exists

To answer questions about thousands of pages of PDFs, we can't send all those pages to the LLM at once — it would exceed the "context window" (token limit) and cost a fortune. 

Instead, we find the *5 most relevant paragraphs* and send only those.

How do we find them quickly? We use **Embeddings** and **Vector Search**.

1. **Before the app started** (done by `indexing/build_index.py`), every paragraph (chunk) of the PDFs was turned into a list of 384 numbers (an "embedding vector"). These vectors capture the *meaning* of the text. They were saved into `vector_store/index.faiss`.
2. **Now**, when the user asks a question, we turn their question into a 384-number vector using the exact same model.
3. We ask FAISS (Facebook AI Similarity Search) to find the 5 pre-computed chunk vectors that are mathematically closest to the question vector. 

Close in math = Close in meaning.

---

## The Real Code, Annotated

**File:** [`backend/rag/retriever.py`](file:///Users/savyaraj/Desktop/policyiq/backend/rag/retriever.py)

### Part 1 — Loading the Database (Lines 26–46)

```python
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

@functools.lru_cache(maxsize=1)
def _load_vectorstore() -> FAISS:
    """Loads and caches the FAISS index from disk."""
    if not (VECTOR_STORE_DIR / "index.faiss").exists():
        raise FileNotFoundError("FAISS index not found...")
        
    embeddings = HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={"device": "cpu"},
    )
    vectorstore = FAISS.load_local(
        str(VECTOR_STORE_DIR),
        embeddings,
        allow_dangerous_deserialization=True,
    )
    return vectorstore
```

**What is `HuggingFaceEmbeddings`?** This is the model that turns text into numbers. `all-MiniLM-L6-v2` is a very fast, small model that runs perfectly on a CPU without needing a GPU.

**What is `@lru_cache(maxsize=1)`?** Loading the FAISS index from disk takes a second. We don't want to do that on every single chat message. This decorator "caches" the result. The first time `_load_vectorstore()` is called, it loads the file. Every subsequent time, it just returns the already-loaded object instantly.

### Part 2 — The Retriever Factory (Lines 175–183)

```python
def get_retriever(k: int = 5):
    """Returns a LangChain retriever for the top-k most relevant chunks."""
    vectorstore = _load_vectorstore()
    raw_retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )
    return SanitizingRetriever(underlying_retriever=raw_retriever)
```

This returns a LangChain object that `pipeline.py` can use. `k=5` means "give me the top 5 most similar chunks."

But notice it wraps the raw retriever in a custom `SanitizingRetriever`. Why? Let's look inside it.

### Part 3 — Query Expansion & Deduplication (Lines 87–139)

Inside `SanitizingRetriever._get_relevant_documents`:

```python
        # Query expansion / targeting for multi-standard comparisons
        query_lower = query.lower()
        extra_queries = []
        
        if "peso" in query_lower:
            # Check if any PESO documents were returned in the main retrieval
            has_peso = any("peso" in doc.metadata.get("source", "").lower() for doc in docs)
            if not has_peso:
                # Run focused PESO searches depending on context
                if "cylinder" in query_lower or "storage" in query_lower:
                    extra_queries.append("PESO cylinder storage")
                # ...
                
        # Run extra queries if any
        for eq in extra_queries:
            # ... runs FAISS similarity_search_with_relevance_scores(eq, k=2)
            # ... appends results to docs
```

**Why do we need query expansion?**
Vector search isn't perfect. If the user asks "According to PESO, what is the cylinder distance?", the math might match chunks about *OISD* cylinder distances higher than the PESO ones. 

This code checks: "The user asked about PESO, but did our top 5 results actually include any PESO documents?" If not, it forcefully runs a *second* search specifically tailored to find PESO chunks and adds them to the pile. This is a crucial technique for making RAG reliable in the real world.

### Part 4 — The Returned Chunks (Lines 140–168)

FAISS doesn't just return text. It returns `Document` objects that contain both `page_content` and `metadata`. This metadata was attached back when the PDFs were processed by `chunker.py`.

```python
        sanitized_docs = []
        for doc in unique_docs:
            meta = doc.metadata.copy()
            meta.setdefault("source", "unknown")
            meta.setdefault("category", "general")
            meta.setdefault("chunk_index", 0)
            meta.setdefault("page", "unknown")
            meta.setdefault("section", "General")
            
            sanitized_docs.append(Document(page_content=doc.page_content, metadata=meta))
            
        return sanitized_docs
```

The retriever cleans up the metadata, ensuring every chunk has a `source` (filename) and a `page` number. This is the exact data that travels back to `pipeline.py` and eventually becomes the citation cards on the frontend.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **Embedding** | Turning a sentence into a vector (list of numbers) so a computer can calculate semantic similarity. |
| **Vector Store** | A database optimized for storing and querying embedding vectors. (FAISS) |
| **FAISS** | Facebook AI Similarity Search. A fast library for nearest-neighbor search. |
| **Nearest-Neighbor** | Finding the points in space that are closest to your target point. (Highest cosine similarity). |
| **Top-K** | Returning the *K* best matches from a search, rather than all matches. |
| **Query Expansion** | Modifying or adding to the user's search query behind the scenes to improve retrieval results. |
| **Caching** | Storing the result of an expensive operation (like loading a file) in memory so future requests are fast. |

---

## Try It Yourself

### Exercise 1 — Look at the actual FAISS files
Open the folder explorer and look inside `vector_store/`. You will see two files:
- `index.faiss` — The actual binary math data (the vectors).
- `index.pkl` — A Python pickle file containing the text chunks and metadata that correspond to those vectors.

### Exercise 2 — Change Top-K
In `retriever.py`, line 175:
`def get_retriever(k: int = 5):`
Change `k=5` to `k=10`.
Now the pipeline will pull twice as much context into the prompt. The AI might give more comprehensive answers, but it will take slightly longer and cost more tokens. (Change it back to 5 after).

---

## Common Beginner Mistakes at This Stage

1. **Forgetting to build the index** — If you delete the `vector_store` folder and start the server, it will crash with a `FileNotFoundError`. The FAISS index doesn't build itself on startup; you must run the indexing script first (`python indexing/build_index.py`).

2. **Mixing embedding models** — If you build the index using OpenAI's `text-embedding-3-small`, but try to query it using `all-MiniLM-L6-v2`, it will fail or return garbage. The math doesn't align. The query model must be exactly the same model used for indexing.

---

## What's Next

Now we have our 5 highly relevant text chunks. We need to hand them to the AI so it can generate a human-readable answer. In **[Stage 7](./07-rag-generation.md)**, we look at `generator.py` and see exactly what prompt is sent to the LLM.
