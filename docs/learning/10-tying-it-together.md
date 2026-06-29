# Stage 10 — Tying It Together

> **The Full Journey:**  
> A narrative walkthrough of a single question traveling from the user's brain, through the entire PolicyIQ architecture, and back again.

---

## The Master Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                 THE BROWSER                                      ║
║                                                                                  ║
║   1. User types "What is the minimum safe distance for LPG storage?"             ║
║                                                                                  ║
║   ┌──────────────────────────┐         ┌──────────────────────────┐              ║
║   │  Chat.jsx (Stage 1)      │         │  client.js (Stage 2)     │              ║
║   │  - Updates messages state│────────►│  - Prepares JSON body    │              ║
║   │  - Shows bouncing dots   │         │  - Sends POST /ask       │              ║
║   └──────────────────────────┘         └──────────────────────────┘              ║
╚═════════════════════════════╤════════════════════════════════════════════════════╝
                              │
                    JSON via HTTP Network
                              ▼
╔═════════════════════════════╧════════════════════════════════════════════════════╗
║                                 THE SERVER                                       ║
║                                                                                  ║
║   ┌──────────────────────────┐         ┌──────────────────────────┐              ║
║   │  chat.py (Stage 3 & 4)   │         │  pipeline.py (Stage 5)   │              ║
║   │  - Validates AskRequest  │────────►│  - Condenses question    │              ║
║   │  - Runs Prompt Guard     │         │  - Runs Gate 1 (Scope)   │              ║
║   └──────────────────────────┘         └───────┬──────────────────┘              ║
║                                                │                                 ║
║   ┌──────────────────────────┐         ┌───────▼──────────────────┐              ║
║   │  vector_store (Stage 6)  │◄────────│  retriever.py (Stage 6)  │              ║
║   │  - FAISS Index           │ chunks  │  - Embeds question       │              ║
║   │  - Pickle Metadata       │────────►│  - Finds Top-5 matches   │              ║
║   └──────────────────────────┘         └───────┬──────────────────┘              ║
║                                                │                                 ║
║   ┌──────────────────────────┐         ┌───────▼──────────────────┐              ║
║   │  Groq API (Stage 7)      │◄────────│  generator.py (Stage 7)  │              ║
║   │  - Llama 3.3 70B         │ prompt  │  - Formats Context       │              ║
║   │  - Generates answer      │────────►│  - Applies SYSTEM PROMPT │              ║
║   └──────────────────────────┘ answer  └───────┬──────────────────┘              ║
║                                                │                                 ║
║   ┌──────────────────────────┐         ┌───────▼──────────────────┐              ║
║   │  chat.py (Stage 8)       │◄────────│  pipeline.py             │              ║
║   │  - Wraps in AskResponse  │ dict    │  - Saves to History      │              ║
║   │  - Serializes to JSON    │         │  - Returns final dict    │              ║
║   └──────────────────────────┘         └──────────────────────────┘              ║
╚═════════════════════════════╤════════════════════════════════════════════════════╝
                              │
                    JSON via HTTP Network
                              ▼
╔═════════════════════════════╧════════════════════════════════════════════════════╗
║                                 THE BROWSER                                      ║
║                                                                                  ║
║   ┌──────────────────────────┐         ┌──────────────────────────┐              ║
║   │  Chat.jsx                │         │  ChatMessage.jsx (Stg 9) │              ║
║   │  - Receives Response     │────────►│  - Parses Markdown       │              ║
║   │  - Hides bouncing dots   │         │  - Draws Source Cards    │              ║
║   └──────────────────────────┘         └──────────────────────────┘              ║
║                                                                                  ║
║   10. User reads: "**15 metres** is the minimum safe distance..."                ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## The Story of One Request

Let's walk through exactly what happens when a user asks a question, reading it like a story. 

We will follow this specific question:
> **"What is the minimum safe distance for LPG storage near a process unit?"**

### 1. The Journey Begins (Browser)

The user opens `http://localhost:5173`. The Vite dev server serves the React app. 
The user clicks the first suggested question button.

Inside `Chat.jsx` (**Stage 1**), the `sendMessage` function fires. It immediately adds a blue user bubble to the screen so the user feels heard. It sets `isLoading` to true, which causes `TypingIndicator.jsx` to render the bouncing dots. 

Then, it calls `askQuestion(question, sessionId)`. 

Inside `client.js` (**Stage 2**), Axios takes the question string and builds an HTTP POST request. It looks up the backend URL in `.env.local` (`http://localhost:8000`). It packages the question into a JSON payload `{"question": "What is the minimum safe distance for LPG storage near a process unit?", "session_id": null}` and fires it over the network.

### 2. Crossing the Threshold (Backend Entry)

The request hits the FastAPI server running on port 8000 (**Stage 3**). 

First, `main.py` checks CORS. It sees the request came from `localhost:5173`. That's on the allowed list, so it lets it pass.

FastAPI looks at the URL (`/ask`) and routes it to `chat.py`. It reads the JSON body and compares it against the `AskRequest` schema defined in `schemas.py`. Everything matches perfectly. FastAPI creates an `AskRequest` object and hands it to the `ask_endpoint` function.

### 3. The Security Check (Backend Auth)

Before doing anything else, `chat.py` (**Stage 4**) sends the question to a tiny, ultra-fast AI model (Llama Prompt Guard). It asks: "Is this a prompt injection attack?" 

The tiny AI says "SAFE". 

Now, `chat.py` calls `pipeline.ask(user_query)`. 

### 4. The Orchestrator Takes Over (RAG Pipeline)

Inside `pipeline.py` (**Stage 5**), the pipeline checks the chat history. Since `session_id` was null, this is a new conversation. There is no history. The condensation step is skipped.

The pipeline runs Gate 1. It asks the LLM: "Is 'What is the minimum safe distance for LPG storage' relevant to IOCL policies?" The LLM replies "yes".

### 5. Digging for Facts (Retrieval)

The pipeline asks `retriever.py` (**Stage 6**) for help. 

The retriever takes the question text and runs it through a local HuggingFace embedding model (`all-MiniLM-L6-v2`). The model converts the English sentence into a vector — a list of 384 numbers representing its semantic meaning.

The retriever takes this 384-number vector and plunges into the FAISS vector database (loaded from `vector_store/index.faiss`). It asks FAISS: "Find me the 5 vectors in here that are mathematically closest to my query vector."

FAISS does the math instantly. It returns 5 vectors. The retriever looks up the text chunks associated with those vectors in `index.pkl`. 

One of those chunks happens to be a paragraph from `OISD_144_2023.pdf` that explicitly states that the distance for LPG vessels up to 20 Cu. Mt. is 15 metres.

The retriever returns these 5 text chunks, along with their metadata (filename, page number, score), back to the pipeline.

The pipeline runs Gate 2. It checks the FAISS score of the best chunk. The score is 0.85, which is way above the `0.25` threshold. The pipeline proceeds.

### 6. Writing the Answer (Generation)

The pipeline hands the 5 chunks and the user's question to LangChain.

LangChain uses `generator.py` (**Stage 7**) to build a massive prompt. It starts with the `SYSTEM_PROMPT` ("You are PolicyIQ... always lead with the direct answer in BOLD..."). It pastes in the 5 chunks formatted nicely with `[Source: OISD-144]`. Finally, it pastes the user's question at the bottom.

This massive text string is sent over the internet to Groq's cloud servers. 

The Llama 3.3 70B model reads the prompt. It sees the rule to use BOLD. It reads the chunk about 15 metres. It predicts the best possible response. 

A few hundred milliseconds later, Groq sends back the generated string:
`"**15 metres** is the minimum safe distance for LPG storage vessels up to 20 Cu. Mt. from a process unit. [OISD_144_2023, Page 25]"`

### 7. Packaging the Delivery (Backend Assembly)

Back in `pipeline.py`, the pipeline takes the answer string. It creates a new `session_id` (since this was a new chat) and saves the question and answer to its internal memory dictionary. It cleans up the metadata for the 5 chunks. It returns a Python dictionary containing everything.

In `chat.py` (**Stage 8**), FastAPI wraps this dictionary into the `AskResponse` Pydantic model. It validates that all required fields are present. It serializes the object into a JSON string, attaches an HTTP 200 OK header, and sends it back over the network to the browser.

### 8. The Final Polish (Frontend Render)

Back in the browser, `client.js` receives the JSON. The `await` unpauses. 

`Chat.jsx` hides the bouncing dots. It calls `setMessages` to append the new assistant message to the screen. 

`ChatMessage.jsx` (**Stage 9**) wakes up. It sees the Markdown string and uses `ReactMarkdown` to turn `**15 metres**` into bold HTML text. It looks at the 5 source documents. It sees that two of them have scores above 60%, so it draws them as prominent cards with orange stripes (because they are safety regulations). It hides the other three behind a "Show additional sources" toggle. It draws the thumbs up/thumbs down feedback buttons.

The user sees the answer appear on their screen. The entire process took about 1.5 seconds.

---

## Conclusion

You have now traced the entire PolicyIQ stack end-to-end. You've seen how React manages the UI, how FastAPI manages the network, how FAISS searches for facts, and how prompt engineering forces an LLM to behave predictably.

If you understand this flow, you understand the core architecture of nearly every modern AI chatbot application.

**[End of Curriculum. Return to the Master Overview](./00-overview.md) to decide what to learn next.**
