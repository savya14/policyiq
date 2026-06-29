# Stage 8 — Backend: Response Assembly

> **Where we are in the flow:**  
> `pipeline.py finishes → chat.py wraps result in AskResponse → FastAPI sends JSON back`

---

## Architecture Diagram — Stage 8

```
╔══════════════════════════════════════════════════════════════════╗
║                  BACKEND (chat.py & schemas.py)                  ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/pipeline.py                             ║   ║
║   │                                                          ║   ║
║   │   return {                                               ║   ║
║   │       "answer": "**15 metres**...",                      ║   ║
║   │       "session_id": "a1b2c3d4",                          ║   ║
║   │       "source_documents": [ { "source": ... } ],         ║   ║
║   │       "is_in_scope": True,                               ║   ║
║   │       "rate_limited": False,                             ║   ║
║   │       "blocked": False,                                  ║   ║
║   │       "block_reason": ""                                 ║   ║
║   │   }                                                      ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  Python Dictionary           ║
║                               ▼                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              routers/chat.py               ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  @router.post("/ask", response_model=AskResponse)       ║   ║
║   │  async def ask_endpoint(request: AskRequest):           ║   ║
║   │      try:                                                ║   ║
║   │          result = ask(request.question, ...)             ║   ║
║   │      except Exception as exc:                            ║   ║
║   │          raise HTTPException(status_code=500, ...)       ║   ║
║   │                                                          ║   ║
║   │      return AskResponse(**result)                        ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  Pydantic AskResponse Object ║
║                               ▼                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              FastAPI Internals                           ║   ║
║   │                                                          ║   ║
║   │   1. Serialize AskResponse to JSON string                ║   ║
║   │   2. Set HTTP Status Code 200 OK                         ║   ║
║   │   3. Set Content-Type: application/json                  ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │                              ║
╚══════════════════════════════════════════════════════════════════╝
                                │
          HTTP 200 OK           ▼
          {"answer": "**15..."}
                               [ NETWORK → FRONTEND ]
                                (Stage 9 picks up here)
```

---

## What This Stage Does and WHY It Exists

The hard work is done. We have the answer, and we have the metadata for the source documents. 

But Python dictionaries cannot be sent over a network. Networks only understand text (bytes). We need to convert our Python data into a JSON string. This process is called **Serialization**.

Furthermore, we need to handle what happens if things *fail* (e.g., the database crashed, Groq API timed out). This is called **Error Handling**, and it's communicated via **HTTP Status Codes**.

---

## The Real Code, Annotated

### Part 1 — The Endpoint Return (Lines 83–91)

**File:** [`backend/routers/chat.py`](file:///Users/savyaraj/Desktop/policyiq/backend/routers/chat.py)

```python
    # --- EXISTING: RAG PIPELINE ---
    try:
        result = ask(question=user_query, session_id=request.session_id)
        # Ensure default blocked/block_reason are populated
        result["blocked"] = False
        result["block_reason"] = ""
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return AskResponse(**result)
```

**What is `**result`?**
`result` is a Python dictionary returned by `pipeline.py`. The `**` operator "unpacks" the dictionary into keyword arguments. 
So `AskResponse(**result)` is exactly the same as typing:
`AskResponse(answer=result["answer"], session_id=result["session_id"], ...)`

**What happens if it fails?**
Look at the `except Exception as exc:` block. If anything inside `ask()` crashes (that wasn't already caught and handled gracefully like the Prompt Guard), we raise an `HTTPException` with `status_code=500`.

### Part 2 — The Output Schema (Lines 31–38)

**File:** [`backend/schemas.py`](file:///Users/savyaraj/Desktop/policyiq/backend/schemas.py)

```python
class AskResponse(BaseModel):
    answer: Optional[str] = None
    session_id: str
    source_documents: List[SourceDocument] = []
    is_in_scope: bool = True
    rate_limited: bool = False
    blocked: bool = False
    block_reason: Optional[str] = ""
```

Just like `AskRequest` validated the incoming JSON, `AskResponse` validates the outgoing data. 

If `pipeline.py` accidentally returned a dictionary missing the `session_id` key, `AskResponse(**result)` would throw a validation error *on the backend* before sending broken data to the frontend. This strict typing ensures the frontend always receives exactly the JSON shape it expects.

### Part 3 — How the Frontend Catches Errors

Back in Stage 1, we saw this code in `Chat.jsx`:

```jsx
// frontend/src/pages/Chat.jsx
    } catch (err) {
      const status = err?.response?.status;
      const isRateLimit = status === 429 || (err?.response?.data?.detail && String(err.response.data.detail).includes("429"));
      
      // If we catch client side errors, we can pass them nicely
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: isRateLimit ? null : 'Something went wrong. Please try again.', 
          sources: null,
          rate_limited: isRateLimit,
          blocked: false,
          block_reason: ""
        },
      ]);
    }
```

If FastAPI throws `HTTPException(status_code=500)`, the `await askQuestion()` call in `client.js` fails. The execution jumps immediately to this `catch` block. The UI then draws the generic "Something went wrong" message.

Notice how the frontend also specifically looks for status `429` (Too Many Requests). If it sees that, it sets `rate_limited: true`, which tells `ChatMessage.jsx` to draw the yellow rate-limit warning card.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **Serialization** | Converting an object in memory (like a Python dict) into a string format (like JSON) that can be saved or transmitted. |
| **Deserialization** | The reverse: turning a JSON string back into a Python dictionary. FastAPI does both automatically. |
| **HTTP Status Code** | A number returned by the server telling the client what happened. |
| **HTTP 200 OK** | Success. The request worked and the data is attached. |
| **HTTP 500 Internal Server Error** | Something broke on the backend. The server crashed or hit an unhandled exception. |
| **HTTP 429 Too Many Requests** | Rate limiting. The client has sent too many requests in a given amount of time. |
| **Dictionary Unpacking (`**`)** | A Python syntax trick to pass all keys in a dictionary as named arguments to a function or class constructor. |

---

## Try It Yourself

### Exercise 1 — Force a 500 Error
In `chat.py`, line 84, comment out the call to `ask()` and replace it with an error:
```python
    try:
        # result = ask(question=user_query, session_id=request.session_id)
        raise ValueError("I broke the backend on purpose!")
```
Go to the frontend and ask a question. The bouncing dots will stop, and you will see "Something went wrong. Please try again." Check the backend terminal to see the 500 error logged.

### Exercise 2 — Force a Validation Error
In `chat.py`, line 91, break the schema mapping:
```python
    # return AskResponse(**result)
    return AskResponse(answer="I forgot the session_id")
```
Send a question. The backend terminal will throw a massive `ValidationError` because `session_id` is a required field in `AskResponse` and we didn't provide it.

---

## What's Next

The JSON has crossed the network and arrived safely back in the browser. In **[Stage 9](./09-frontend-rendering.md)**, we look at `ChatMessage.jsx` and see how this JSON is transformed into beautiful chat bubbles and citation cards.
