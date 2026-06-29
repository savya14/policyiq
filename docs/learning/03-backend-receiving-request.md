# Stage 3 — Backend: Receiving the Request

> **Where we are in the flow:**  
> `HTTP POST /ask arrives → main.py CORS check → chat.py router → AskRequest validation`

---

## Architecture Diagram — Stage 3

```
[ NETWORK ] ──HTTP POST /ask──►

╔══════════════════════════════════════════════════════════════════╗
║                  BACKEND (FastAPI Server)                        ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              main.py                      ← YOU ARE     ║   ║
║   │                                              HERE        ║   ║
║   │  app = FastAPI(...)                                      ║   ║
║   │  app.add_middleware(CORSMiddleware, ...)  ← runs FIRST   ║   ║
║   │                                                          ║   ║
║   │  app.include_router(chat.router)                        ║   ║
║   │  app.include_router(admin.router)                       ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  matches /ask → routes to:       ║
║                               ▼                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              routers/chat.py               ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  @router.post("/ask", response_model=AskResponse)       ║   ║
║   │  async def ask_endpoint(request: AskRequest):           ║   ║
║   │                                                          ║   ║
║   │  FastAPI automatically:                                  ║   ║
║   │    1. Reads raw JSON body from HTTP request              ║   ║
║   │    2. Validates it against AskRequest schema             ║   ║
║   │    3. Creates an AskRequest object                       ║   ║
║   │    4. Passes it to ask_endpoint()                        ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  request.question available      ║
║                               ▼                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              schemas.py                                  ║   ║
║   │                                                          ║   ║
║   │  class AskRequest(BaseModel):                           ║   ║
║   │      question: str                                       ║   ║
║   │      session_id: Optional[str] = None                   ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
               │
               │  (Stage 4: security guard check next)
               ▼
```

---

## What This Stage Does and WHY It Exists

When the HTTP request arrives at port 8000, three things happen in quick succession:

1. **CORS check** (`main.py`) — The browser's security system verifies this frontend is allowed to call this backend.
2. **Routing** (`main.py`) — FastAPI figures out which Python function should handle `/ask`.
3. **Validation** (`schemas.py`) — FastAPI automatically parses the JSON body and enforces that it has the right fields and types.

All three are handled by FastAPI's machinery — you write almost no code for any of this. The framework does the heavy lifting.

---

## The Real Code, Annotated

### Part 1 — `main.py` — The App Entry Point

**File:** [`backend/main.py`](file:///Users/savyaraj/Desktop/policyiq/backend/main.py)

```python
# Lines 10–26 — Environment setup (must happen BEFORE other imports)
import os
from dotenv import load_dotenv

import pkgutil
import importlib.util
if not hasattr(pkgutil, "find_loader"):
    def _find_loader(fullname):
        try:
            spec = importlib.util.find_spec(fullname)
            return spec.loader if spec is not None else None
        except Exception:
            return None
    pkgutil.find_loader = _find_loader

load_dotenv()   # ← reads .env file into os.environ
```

**`load_dotenv()`** — The `python-dotenv` library reads the `.env` file in the project root and makes its variables available via `os.getenv()`. Crucially, this must be called *before* any other imports that read env vars (like `generator.py` which reads `GROQ_API_KEY` at import time). The comment in the file explicitly flags this.

**The `pkgutil` shim** — Python 3.14 removed `pkgutil.find_loader()`, which `pytesseract` (the OCR library) still uses. This shim patches it back in. A real-world example of compatibility code you'll often see in production projects.

```python
# Lines 28–32 — FastAPI app creation
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import chat, admin

app = FastAPI(title="PolicyIQ API", version="1.0.0")
```

`FastAPI()` creates the application object. Everything hangs off `app`. The `title` and `version` appear in the auto-generated API documentation at `http://localhost:8000/docs`.

### Part 2 — CORS Configuration (Lines 34–52)

```python
origins = [
    "http://localhost:5173",    # Vite dev server default
    "http://localhost:5174",    # Vite dev server alternate port
    "http://localhost:3000",    # Create React App default
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    os.getenv("FRONTEND_URL", ""),   # production Vercel URL from .env
]
origins = [o for o in origins if o]  # remove empty strings

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],     # allow GET, POST, DELETE, etc.
    allow_headers=["*"],     # allow any headers
)
```

**What is CORS and why does it matter?**

CORS stands for Cross-Origin Resource Sharing. Here's the problem it solves:

Imagine your bank's website (`bank.com`) makes an API call to send money. A malicious website (`evil.com`) could try to make that same API call from your browser — using your cookies, your session, your credentials. Browsers block this by default: a web page at `localhost:5173` is NOT allowed to make API calls to `localhost:8000` unless the server at port 8000 explicitly grants permission.

The `CORSMiddleware` is what grants that permission. It adds HTTP headers to every response:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: *
Access-Control-Allow-Headers: *
```

The browser reads these headers and only then allows the frontend JavaScript to see the response.

**The real bug we hit:** If you ever saw `CORS policy: No 'Access-Control-Allow-Origin' header is present` in the browser console while developing PolicyIQ — that was because the frontend was running on a port not in the `origins` list. The fix was adding that port. This is exactly what lines 35–43 in `main.py` address.

### Part 3 — Routers (Lines 54–55)

```python
app.include_router(chat.router)
app.include_router(admin.router)
```

**What is a router?**

A FastAPI `APIRouter` is like a "sub-app" — it groups related endpoints together. `chat.py` has the `/ask` and `/feedback` endpoints. `admin.py` has all the `/admin/*` endpoints. Instead of putting every endpoint in `main.py`, routers keep things organized.

`include_router()` attaches all the routes from `chat.router` to the main `app`. When a request for `/ask` arrives, FastAPI looks through all registered routes and finds the one in `chat.py`.

### Part 4 — The `/ask` Endpoint in `chat.py`

**File:** [`backend/routers/chat.py`](file:///Users/savyaraj/Desktop/policyiq/backend/routers/chat.py)

```python
# Lines 1–11 — Imports and router creation
import os
import uuid
from fastapi import APIRouter, HTTPException
from groq import Groq

from backend.rag.pipeline import ask
from backend.schemas import AskRequest, AskResponse, FeedbackRequest, FeedbackResponse
import json
from datetime import datetime

router = APIRouter()
```

`APIRouter()` creates the router object. Every `@router.post()` and `@router.get()` decoration registered below will be part of this router, which gets attached to `app` in `main.py`.

```python
# Lines 51–91 — The /ask endpoint
@router.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest) -> AskResponse:
    """
    Ask a policy question. Supports conversation memory via session_id.
    ...
    """
    user_query = request.question
```

**Unpacking the decorator `@router.post("/ask", response_model=AskResponse)`:**

- `@router.post("/ask")` — Register this function to handle `POST /ask`. The `@` syntax is a Python decorator — it wraps the function with extra behavior.
- `response_model=AskResponse` — FastAPI will automatically serialize the function's return value into JSON using the `AskResponse` Pydantic schema. It also validates the output and documents the response shape in the API docs.

**`async def ask_endpoint(request: AskRequest)`:**

- `async def` — This endpoint is asynchronous, meaning FastAPI can handle other requests while this one is waiting (e.g., waiting for the Groq API to respond).
- `request: AskRequest` — The type annotation here is doing real work. FastAPI sees that this parameter is typed as `AskRequest`, so it automatically:
  1. Reads the raw HTTP request body (the JSON string)
  2. Parses it into a Python dict
  3. Validates it against `AskRequest` — if `question` is missing, FastAPI immediately returns HTTP 422 (Unprocessable Entity) without ever calling `ask_endpoint`
  4. Creates an `AskRequest` object and passes it as `request`

This is **dependency injection at work** — FastAPI injects the validated request object for you.

### Part 5 — Pydantic Schemas in `schemas.py`

**File:** [`backend/schemas.py`](file:///Users/savyaraj/Desktop/policyiq/backend/schemas.py)

```python
# Lines 1–2
from pydantic import BaseModel, Field
from typing import Optional, List, Union

# Lines 21–29 — What we expect IN
class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = Field(
        default=None,
        description=(
            "Session ID for conversation memory. "
            "Omit to start a new session — one will be created and returned."
        ),
    )

# Lines 31–38 — What we send OUT
class AskResponse(BaseModel):
    answer: Optional[str] = None
    session_id: str
    source_documents: List[SourceDocument] = []
    is_in_scope: bool = True
    rate_limited: bool = False
    blocked: bool = False
    block_reason: Optional[str] = ""
```

**What is Pydantic and why does it exist?**

Without Pydantic, you'd write code like this:

```python
# Dangerous — no validation
@router.post("/ask")
async def ask_endpoint(request: dict):
    question = request.get("question")
    if not question:
        raise HTTPException(400, "question is required")
    if not isinstance(question, str):
        raise HTTPException(400, "question must be a string")
    # ... and so on for every field
```

With Pydantic, you declare what the data should look like, and the framework enforces it:

```python
class AskRequest(BaseModel):
    question: str          # required; must be a string
    session_id: Optional[str] = None  # optional; defaults to None
```

If the JSON body is `{"question": 42}` (a number instead of a string), FastAPI returns a 422 error automatically. If it's `{}` (missing `question`), same thing. You never write validation code manually.

**`Optional[str]`** — This is a Python type hint meaning "a string OR None". `Optional[str] = None` means "a string or None, defaulting to None."

**`List[SourceDocument]`** — A list of `SourceDocument` objects. Pydantic validates each item in the list against `SourceDocument`'s schema.

**`Field(default=None, description=...)`** — `Field()` adds extra metadata. Here it adds a human-readable description that appears in the API documentation at `/docs`.

---

## The Full Flow, Summarized

```
Browser sends:
POST http://localhost:8000/ask
{ "question": "What is the safe distance for LPG?" }
        │
        ▼ FastAPI receives this
        │
        ├─ CORSMiddleware runs: is "http://localhost:5173" in origins? YES → continue
        │
        ├─ Router matching: does /ask match any registered route? YES → ask_endpoint
        │
        ├─ Pydantic validation: is { "question": "..." } a valid AskRequest? YES
        │  Creates: request = AskRequest(question="What is...", session_id=None)
        │
        └─ ask_endpoint(request) is called
           user_query = "What is the safe distance for LPG?"
```

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **FastAPI** | A Python web framework. Handles routing, validation, serialization, and documentation automatically. |
| **Endpoint** | A URL + HTTP method pair that the server listens on. `/ask` with `POST` is one endpoint. |
| **Router** | A `APIRouter()` that groups related endpoints. Attached to the main `app` via `include_router()`. |
| **Decorator** | `@router.post("/ask")` — a function that wraps another function. FastAPI uses decorators to register routes. |
| **Pydantic BaseModel** | A class you inherit to define a data schema. FastAPI uses it for automatic validation. |
| **Type annotation** | `request: AskRequest` — Python's way of saying "this parameter should be this type." FastAPI acts on these. |
| **CORS** | Browser security rule requiring servers to explicitly allow cross-origin requests. |
| **Middleware** | Code that runs on every request before it reaches the route handler. `CORSMiddleware` is an example. |
| **HTTP 422** | "Unprocessable Entity" — FastAPI's automatic response when Pydantic validation fails. |
| **`Optional[str]`** | Python type hint for "string or None." Equivalent to `str | None` in newer Python. |
| **`load_dotenv()`** | Reads `.env` file and populates `os.environ`. Must be called before reading env vars. |

---

## Try It Yourself

### Exercise 1 — View the Auto-Generated API Docs
Start the backend (`uvicorn backend.main:app --reload`) and open:
`http://localhost:8000/docs`

You'll see a Swagger UI showing all endpoints, their expected inputs, and response schemas — all generated automatically from your Pydantic models.

### Exercise 2 — Break Validation on Purpose
With the backend running, open your browser console or a terminal and run:
```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"wrong_field": "test"}'
```

You'll get a 422 response explaining that `question` is required. This is Pydantic validation working.

### Exercise 3 — Add a field to AskRequest
In `schemas.py`, add an optional `language` field:
```python
class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    language: Optional[str] = "english"  # ← ADD THIS
```

Now `request.language` is available in `ask_endpoint`. Try `print(request.language)` in the endpoint and watch it print in the backend terminal when you send a question.

---

## Common Beginner Mistakes at This Stage

1. **Importing before `load_dotenv()`** — If `generator.py` tries to read `GROQ_API_KEY` at import time and you import it before calling `load_dotenv()`, you get `None`. The comment on line 4 of `main.py` exists precisely because of this gotcha.

2. **Not including the router** — If you create a new router file but forget `app.include_router(my_router.router)` in `main.py`, your endpoints will silently not exist (FastAPI returns 404).

3. **Async vs sync mixing** — `async def` functions can call other `async def` functions with `await`. But you can NOT call `await` inside a regular `def`. If you need to call an async function from sync code, you need `asyncio.run()` — but in FastAPI routes, always use `async def`.

4. **CORS allows too much in production** — The current config uses `allow_origins=["specific URL"]`. Never put `allow_origins=["*"]` in production — that allows ANY website to call your API.

---

## What's Next

In **[Stage 4](./04-backend-auth.md)**, we look at the security layer — first the prompt injection guard that runs on every `/ask` request, then the JWT authentication that protects the admin routes.
