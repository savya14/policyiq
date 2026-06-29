# Stage 2 — Frontend: API Call

> **Where we are in the flow:**  
> `Chat.jsx calls sendMessage() → await askQuestion() → client.js builds HTTP request → request leaves browser`

---

## Architecture Diagram — Stage 2

```
╔══════════════════════════════════════════════════════════════════╗
║                    BROWSER (React App)                           ║
║                                                                  ║
║   Chat.jsx                                                       ║
║   └── sendMessage()                                              ║
║         │                                                        ║
║         │  calls: await askQuestion(q, sessionId)                ║
║         ▼                                                        ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              client.js                     ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  const api = axios.create({                              ║   ║
║   │    baseURL: 'http://localhost:8000'   ← from .env.local  ║   ║
║   │    timeout: 60000                                        ║   ║
║   │  })                                                      ║   ║
║   │                                                          ║   ║
║   │  askQuestion(question, sessionId)                        ║   ║
║   │    ├─ body = { question: "...", session_id: "..." }      ║   ║
║   │    └─ api.post('/ask', body)   ─────────────────────┐   ║   ║
║   └──────────────────────────────────────────────────────╫───┘   ║
║                                                          ║        ║
╚═════════════════════════════════════════════════════════╪════════╝
                                                          ║
         HTTP POST http://localhost:8000/ask              ║
         Headers: Content-Type: application/json          ║
         Body: {"question":"...", "session_id":"..."}      ║
                                                          ▼
                                              [ NETWORK → BACKEND ]
                                               (Stage 3 picks up here)
```

---

## What This Stage Does and WHY It Exists

Once the user hits Enter, the question string needs to travel from the browser to the Python server running on your computer (or in the cloud). That journey uses **HTTP** — the same protocol your browser uses to load web pages, just sending data instead of HTML.

`client.js` is the dedicated module that handles this. It's kept separate from `Chat.jsx` so that if you ever need to change the API URL or add authentication headers, you change it in one place instead of hunting through every component.

---

## The Real Code, Annotated

**File:** [`frontend/src/api/client.js`](file:///Users/savyaraj/Desktop/policyiq/frontend/src/api/client.js)

### Part 1 — The axios Instance (Lines 1–6)

```js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60000, // 60s — Groq can be slow on first cold query
})
```

**What is axios?** It's a JavaScript library that makes HTTP requests easier. The built-in browser `fetch()` API exists, but axios adds nicer error handling, automatic JSON conversion, and a cleaner API. It's imported from `node_modules` (installed via `npm install`).

**`axios.create({...})`** — Creates a pre-configured "instance" of axios. Any call made through this `api` object will automatically:
- Prepend `baseURL` to every URL (so `api.post('/ask', ...)` becomes `api.post('http://localhost:8000/ask', ...)`)
- Cancel the request if it takes longer than `timeout` milliseconds (60 seconds here, because Groq's free tier can be slow on the first call)

**`import.meta.env.VITE_API_URL`** — This reads an environment variable. Let's look at where that comes from.

### Part 2 — The `.env.local` File

**File:** [`frontend/.env.local`](file:///Users/savyaraj/Desktop/policyiq/frontend/.env.local)

```
VITE_API_URL=http://localhost:8000
```

That's the entire file — one line. It tells the frontend: "the backend is running at `localhost` on port `8000`."

**Why not just hard-code the URL in `client.js`?**

Because the URL changes depending on *where* the app is running:
- **Locally** → `http://localhost:8000`
- **In production** (e.g., on Render) → something like `https://policyiq-api.onrender.com`

By using an environment variable, you never change `client.js` itself. You just swap out the `.env.local` file (locally) or set an environment variable in the hosting dashboard (in production).

**Why `VITE_` prefix?** Vite (the build tool) only exposes environment variables that start with `VITE_` to your frontend code. This is a security feature — you don't want to accidentally leak server secrets to the browser. Variables without `VITE_` are invisible to `import.meta.env`.

**`|| ''` (fallback)** — If `VITE_API_URL` is not set, `baseURL` becomes an empty string. This makes all API calls use relative URLs (same origin), which works when the backend serves the frontend directly (no dev server in between).

### Part 3 — The `askQuestion` Function (Lines 10–15)

```js
export async function askQuestion(question, sessionId = null) {
  const body = { question }
  if (sessionId) body.session_id = sessionId
  const { data } = await api.post('/ask', body)
  return data // { answer, session_id, source_documents, is_in_scope }
}
```

Let's go line by line:

**`export async function`** — `export` makes this function importable in other files (like `Chat.jsx` does: `import { askQuestion } from '../api/client'`). `async` means this function returns a Promise and can use `await` inside.

**`const body = { question }`** — Creates an object with one key. `{ question }` is shorthand for `{ question: question }` — when the key and the variable name are the same, JavaScript lets you write it once.

**`if (sessionId) body.session_id = sessionId`** — If there's a session ID (i.e., this is not the first message in the conversation), add it to the body. On the very first question, `sessionId` is `null`, so this line is skipped. The backend will create a new session and send back a `session_id`.

**`const { data } = await api.post('/ask', body)`** — This is the actual HTTP request.
- `api.post('/ask', body)` sends an HTTP POST to `http://localhost:8000/ask` with `body` as the JSON request body.
- `await` pauses here until the response arrives (or until the 60-second timeout fires).
- axios returns a response object with many fields; `{ data }` destructures just the `.data` field — the JSON the backend sent back.

**`return data`** — Returns the parsed JSON to `Chat.jsx`. The comment reminds us the shape: `{ answer, session_id, source_documents, is_in_scope }`.

### Part 4 — The `submitFeedback` Function (Lines 17–21)

```js
export async function submitFeedback(query, response, sources, is_positive) {
  const body = { query, response, sources, is_positive }
  const { data } = await api.post('/feedback', body)
  return data
}
```

Same pattern. This is called when the user clicks 👍 or 👎. The feedback is logged to a file on the backend. Covered in Stage 9.

### Part 5 — Admin Functions with Auth Headers (Lines 23–63)

```js
function authHeaders() {
  const token = localStorage.getItem('policyiq_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function getDocuments() {
  const { data } = await api.get('/admin/documents', { headers: authHeaders() })
  return data
}
```

Admin endpoints require authentication. After logging in, a JWT token is stored in `localStorage` (browser storage that persists across tabs). `authHeaders()` reads it and formats it as an `Authorization: Bearer <token>` HTTP header. If no token exists, it returns an empty `{}` — the request will be sent without an auth header, and the backend will return a 401 error.

---

## What a Promise Is

A **Promise** is a JavaScript object that represents a value that isn't available yet.

Think of it like ordering food at a restaurant. When you place the order, you get a "receipt" (the Promise). The food isn't ready yet. You can do other things while waiting. When the food is ready, the Promise "resolves" with the value (the food/data), or "rejects" with an error (the kitchen ran out of ingredients).

```js
// Without async/await (verbose, Promise-chain style):
api.post('/ask', body)
  .then(response => {
    // this runs when the data arrives
    console.log(response.data);
  })
  .catch(error => {
    // this runs if something went wrong
    console.error(error);
  });

// With async/await (same thing, much cleaner):
try {
  const response = await api.post('/ask', body);
  console.log(response.data);
} catch (error) {
  console.error(error);
}
```

Both do exactly the same thing. `async/await` is just syntactic sugar (prettier syntax) over Promises.

---

## What Actually Goes Over the Network

When `askQuestion("What is the minimum safe distance for LPG storage?", null)` runs, here is the exact HTTP request that leaves your browser:

```
POST /ask HTTP/1.1
Host: localhost:8000
Content-Type: application/json
Accept: application/json, text/plain, */*

{
  "question": "What is the minimum safe distance for LPG storage near a process unit?"
}
```

(No `session_id` field because `sessionId` was `null` on the first call.)

The backend will respond with:

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "answer": "**15 metres** is the minimum safe distance...",
  "session_id": "a1b2c3d4-...",
  "source_documents": [...],
  "is_in_scope": true,
  "rate_limited": false,
  "blocked": false,
  "block_reason": ""
}
```

That JSON becomes the `data` object returned by `askQuestion()` back to `Chat.jsx`.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **HTTP POST** | An HTTP method for sending data to a server. `GET` retrieves, `POST` creates/sends. |
| **Request body** | The data payload sent with a POST request. Here it's JSON: `{"question": "..."}`. |
| **JSON** | JavaScript Object Notation — a text format for data that both browsers and servers can read. Looks like a JS object. |
| **axios** | A JavaScript library for making HTTP requests. Wraps `fetch()` with nicer defaults. |
| **axios instance** | A pre-configured axios object with shared defaults (baseURL, timeout). Avoids repeating config on every call. |
| **environment variable** | A configuration value stored outside code. `VITE_API_URL` controls which server the frontend talks to. |
| **`.env.local`** | A file Vite reads at startup to populate `import.meta.env`. Never committed to Git (contains secrets). |
| **Promise** | A JavaScript object representing an eventual (async) value. Resolves with data or rejects with an error. |
| **destructuring** | `const { data } = response` — pulls the `.data` property out of `response` into its own variable. |
| **Bearer token** | An authentication scheme: send `Authorization: Bearer <token>` header to prove identity. |
| **localStorage** | Browser storage that persists across page refreshes. Used here to remember the JWT auth token. |

---

## Try It Yourself

### Exercise 1 — Watch the Network request in DevTools
1. Open Chrome DevTools (Cmd+Option+I), click the **Network** tab.
2. Filter by **Fetch/XHR** (to see API calls, not CSS/images).
3. Send a question in PolicyIQ.
4. Click the `/ask` request that appears. Look at:
   - **Headers** tab → see the `Content-Type: application/json` header
   - **Payload** tab → see the exact JSON body sent
   - **Response** tab → see the JSON the backend returned

### Exercise 2 — Change the timeout
On line 5 of `client.js`, change:
```js
timeout: 60000, // 60s
```
to:
```js
timeout: 5000, // 5s
```
Then ask a complex question. If the backend takes more than 5 seconds, you'll see an error message. (Change it back after!)

### Exercise 3 — Add a console.log before the API call
In `client.js`, add a log inside `askQuestion`:
```js
export async function askQuestion(question, sessionId = null) {
  console.log('[client.js] Sending request:', { question, sessionId });  // ← ADD
  const body = { question }
```
Open the browser console and watch the log appear every time you send a message.

---

## Common Beginner Mistakes at This Stage

1. **Forgetting `await`** — `const result = api.post(...)` (without `await`) gives you a Promise object, not the data. Always `await` Promise-returning functions inside `async` functions.

2. **CORS errors** — If you see `Access to XMLHttpRequest at 'http://localhost:8000' ... has been blocked by CORS policy` in the console, the backend's `origins` list in `main.py` doesn't include your frontend URL. This was a real bug we fixed — see Stage 3 for the full CORS story.

3. **Misspelling `VITE_` prefix** — If you name your variable `API_URL` (without `VITE_`), `import.meta.env.API_URL` will be `undefined`. Always prefix with `VITE_`.

4. **Editing `.env` instead of `.env.local`** — There's also a `.env` file in the *project root* (for the backend). Vite reads `.env.local` in the *frontend* directory. Don't mix them up.

5. **HTTP vs HTTPS mismatch** — If your frontend is on `https://` (production) but tries to call `http://` (the backend), browsers block it as "mixed content". Production deployments need the backend on HTTPS too.

---

## What's Next

In **[Stage 3](./03-backend-receiving-request.md)**, the HTTP request arrives at `http://localhost:8000/ask`. We'll look at how FastAPI receives it, validates it against the `AskRequest` Pydantic schema, and routes it to the right handler function.
