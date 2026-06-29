# Stage 5 — RAG Pipeline: Orchestration

> **Where we are in the flow:**  
> `chat.py calls ask() → pipeline.py coordinates memory, gates, and generation`

---

## Architecture Diagram — Stage 5

```
╔══════════════════════════════════════════════════════════════════╗
║                  BACKEND (pipeline.py)                           ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/pipeline.py               ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  def ask(question, session_id):                         ║   ║
║   │                                                          ║   ║
║   │    1. Memory Lookup                                      ║   ║
║   │       history = _get_history(session_id)                ║   ║
║   │                                                          ║   ║
║   │    2. Condensation                                       ║   ║
║   │       "what about clause 4?" + history                  ║   ║
║   │         ↓ LLM                                            ║   ║
║   │       "what about clause 4 for LPG storage?"            ║   ║
║   │                                                          ║   ║
║   │    3. Gate 1 (Scope Check)                               ║   ║
║   │       Is it a policy question? (Fast LLM Yes/No)        ║   ║
║   │       If No → Return _OUT_OF_SCOPE                      ║   ║
║   │                                                          ║   ║
║   │    4. Gate 2 (Similarity Check)                          ║   ║
║   │       Are there FAISS chunks > 0.25 similarity?         ║   ║
║   │       If No → Return _LOW_SIMILARITY                    ║   ║
║   │                                                          ║   ║
║   │    5. Execution (The Chain)                              ║   ║
║   │       Calls ConversationalRetrievalChain.invoke()       ║   ║
║   │         ├── (Stage 6) Retriever fetches chunks           ║   ║
║   │         └── (Stage 7) Generator writes answer            ║   ║
║   │                                                          ║   ║
║   │    6. Memory Update                                      ║   ║
║   │       _append_history(question, answer)                 ║   ║
║   │                                                          ║   ║
║   │    7. Return dictionary to chat.py                       ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## What This Stage Does and WHY It Exists

`pipeline.py` is the "conductor of the orchestra." It doesn't actually retrieve documents itself, and it doesn't write the prompt itself. Instead, it manages the *logic flow*. 

**Why does RAG exist?**
Large Language Models (LLMs) are great at talking, but they lie (hallucinate). If you ask an LLM "What is the IOCL safe distance for LPG?", it might guess 10 meters, or it might guess 30 meters based on an OSHA standard from a different country. 

Retrieval-Augmented Generation (RAG) fixes this by forcing the LLM to read a specific document first. 
1. **Retrieve**: "Go find the exact paragraph about LPG safe distances in the IOCL PDFs."
2. **Augment**: "Paste that paragraph into the prompt."
3. **Generate**: "Answer the question using *only* the pasted paragraph."

`pipeline.py` wraps this core RAG loop in safety checks and conversation memory.

---

## The Real Code, Annotated

**File:** [`backend/rag/pipeline.py`](file:///Users/savyaraj/Desktop/policyiq/backend/rag/pipeline.py)

### Part 1 — Memory and Condensation (Lines 51–66, 258–276)

When you ask a follow-up question like "What about clause 4?", a search engine has no idea what you mean. It needs the context from the previous turn.

```python
# A simple in-memory dictionary holding chat histories
_sessions: dict[str, list[tuple[str, str]]] = defaultdict(list)

def _condense_question(question: str, session_id: str) -> str:
    """Rewrite follow-up question using session history into a standalone query."""
    history = _get_history(session_id)
    if not history:
        return question

    llm = _get_llm()
    formatted_history = _format_chat_history(history)
    prompt = CONDENSE_PROMPT.format(
        chat_history=formatted_history,
        question=question
    )
    response = invoke_with_retry(llm.invoke, prompt)
    return response.content.strip()
```

If the user asks "What is the limit?" and the history shows they were just talking about "Grade B employees", this step makes a quick LLM call to rewrite the question as: "What is the limit for Grade B employees?" This standalone question is what actually gets searched in the database.

### Part 2 — Gate 1: Scope Check (Lines 167–187)

```python
def _is_in_scope(question: str) -> bool:
    """Fast yes/no call to Groq before touching FAISS."""
    llm = _get_llm()
    prompt = RELEVANCE_GATE_PROMPT.format(question=question)
    try:
        response = invoke_with_retry(llm.invoke, prompt)
        verdict = response.content.strip().lower()
        return verdict.startswith("yes")
    except Exception as exc:
        return True # Fail open
```

If the user asks "Give me a recipe for chicken tikka", we don't want to waste time searching the database for chicken tikka. We make a very fast, cheap LLM call with a prompt that says "Is this related to IOCL policies? Answer yes or no." If no, the pipeline halts and returns a polite refusal.

### Part 3 — Gate 2: Similarity Check (Lines 194–224)

```python
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.25"))

def _above_similarity_threshold(question: str) -> bool:
    """Checks the normalised relevance score of the top-1 FAISS result."""
    retriever = get_retriever()
    vectorstore = getattr(retriever, "vectorstore", None)
    
    results = vectorstore.similarity_search_with_relevance_scores(question, k=1)
    if not results: return False
    
    _, score = results[0]
    return score >= SIMILARITY_THRESHOLD
```

Even if the question is "in scope", our database might not have the answer. If the question is "What is the standard for underwater welding?" and we only have documents about surface pipelines, the database will return the *closest* chunks it has (maybe surface welding). 

FAISS returns a score (0 to 1) indicating how closely the text matched the query. If the top result's score is below `0.25`, the pipeline halts and says "I couldn't find a relevant section." This prevents the LLM from trying to answer using totally irrelevant text.

### Part 4 — The Main Execution (Lines 406–422)

```python
    chain = _get_chain()
    try:
        result = invoke_with_retry(chain.invoke, {"question": condensed_query, "chat_history": []})
    except RateLimitException:
        return { ... rate limited response ... }
```

This is the big moment. `chain` is a LangChain `ConversationalRetrievalChain`. Calling `invoke()` automatically does the heavy lifting of Stage 6 (Retrieval) and Stage 7 (Generation). 

Notice `chat_history: []`. Because we *already* condensed the question in Part 1, we pass an empty history to the chain so it doesn't try to condense it a second time.

### Part 5 — Packaging the Source Documents (Lines 428–461)

```python
    seen: set[str] = set()
    source_objects: list[dict] = []
    
    for doc in result.get("source_documents", []):
        src = doc.metadata.get("source", "")
        if src in seen: continue  # Deduplicate so UI cards look clean
        seen.add(src)
        
        # Build the dictionary the frontend expects
        source_objects.append({
            "source": src,
            "category": doc.metadata.get("category", ""),
            "page_number": str(doc.metadata.get("page", "unknown")),
            "preview": doc.page_content[:200].strip(),
            "score": doc.metadata.get("score"),
        })
```

The pipeline extracts the metadata from the chunks returned by FAISS and turns them into clean Python dictionaries. These exactly match the `SourceDocument` Pydantic model we saw in Stage 3 (`schemas.py`).

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **RAG** | Retrieval-Augmented Generation. Finding facts first, generating text second. |
| **LangChain** | A library that provides abstractions like "Chains" to wire up LLMs and Retrievers easily. |
| **Condensation** | Using an LLM to rewrite a chatty follow-up into a standalone search query. |
| **Relevance Score** | A mathematical measure of how closely a database chunk matches a query vector. |
| **Exponential Backoff** | A retry strategy (e.g., `invoke_with_retry`). If the API says "too fast", wait 2s, then 4s, then 8s before trying again. |

---

## Try It Yourself

### Exercise 1 — See the Condensation in Action
In `Chat.jsx`, ask "What is the safe distance for LPG storage?". Wait for the answer. Then ask "What about for Grade B?". 
Look at the terminal where the backend is running. You will see the diagnostic logs:
```
  - Raw Query: 'What about for Grade B?'
  - Condensed Query: 'What is the safe distance for Grade B LPG storage?'
```

### Exercise 2 — Tweak the Similarity Threshold
In `pipeline.py`, change line 45:
`SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.25"))`
to:
`SIMILARITY_THRESHOLD = 0.90`

Now try asking a normal policy question. Because `0.90` requires an almost perfect word-for-word match, Gate 2 will likely fail, and the bot will reply with the `_LOW_SIMILARITY` refusal message. (Change it back to `0.25` after!)

---

## Common Beginner Mistakes at This Stage

1. **Assuming the chain does everything magically** — LangChain provides `ConversationalRetrievalChain`, but as you can see, wrapping it in your own custom logic (Gates, custom condensation, deduplication) is required to build a production-grade app.

2. **Memory leaks in development** — `_sessions` is an in-memory dictionary. If this app ran for years with millions of users, that dictionary would grow until the server crashed. Production apps usually use a separate database (like Redis) for `_sessions`.

---

## What's Next

We skipped over the "magic" part where the chain actually searches the database. Let's zoom in on that. In **[Stage 6](./06-rag-retrieval.md)**, we look at `retriever.py` and understand what an "embedding" is and how FAISS works.
