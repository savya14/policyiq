# Stage 9 — Frontend: Rendering

> **Where we are in the flow:**  
> `AskResponse JSON arrives → Chat.jsx adds it to messages state → ChatMessage.jsx renders it`

---

## Architecture Diagram — Stage 9

```
[ NETWORK ] ──HTTP 200 OK──►

╔══════════════════════════════════════════════════════════════════╗
║                    BROWSER (React App)                           ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │                     Chat.jsx                             ║   ║
║   │                                                          ║   ║
║   │  const result = await askQuestion(q, sessionId)          ║   ║
║   │                                                          ║   ║
║   │  setMessages(prev => [...prev, {                         ║   ║
║   │    role: 'assistant',                                    ║   ║
║   │    content: result.answer,                               ║   ║
║   │    sources: result.source_documents,                     ║   ║
║   │    ...                                                   ║   ║
║   │  }]);                                                    ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  React triggers re-render    ║
║                               ▼                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              ChatMessage.jsx               ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  function ChatMessage({ role, content, sources... }):    ║   ║
║   │                                                          ║   ║
║   │   1. Avatar (U or P)                                     ║   ║
║   │   2. Text Bubble                                         ║   ║
║   │      └─ <ReactMarkdown> parses **bold**, bullets         ║   ║
║   │   3. Source Cards                                        ║   ║
║   │      └─ Sort by confidence (High vs Low)                 ║   ║
║   │   4. Feedback Buttons                                    ║   ║
║   │      └─ 👍/👎 calls submitFeedback API                   ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## What This Stage Does and WHY It Exists

The backend sent us raw data. Our job now is to make it look good.

This means:
1. Converting Markdown text (like `**15 metres**`) into actual bold HTML tags.
2. Drawing visually distinct source cards so the user knows *why* the AI said what it said.
3. Providing feedback mechanisms (thumbs up/down) so developers know if the RAG pipeline is working well.

---

## The Real Code, Annotated

**File:** [`frontend/src/components/ChatMessage.jsx`](file:///Users/savyaraj/Desktop/policyiq/frontend/src/components/ChatMessage.jsx)

### Part 1 — Rendering Markdown (Lines 74–129)

The LLM returns text formatted in Markdown. For example: `The limit is **15 metres**.\n* Bullet 1\n* Bullet 2`.

```jsx
  const renderContent = (text) => {
    try {
      return (
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className={`mb-3 text-sm leading-relaxed ${isUser ? 'text-white' : 'text-slate-800'}`}>
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className={`font-semibold ${isUser ? 'text-white' : 'text-slate-900'}`}>
                {children}
              </strong>
            ),
            // ... custom ul, li, ol renderers ...
          }}
        >
          {text}
        </ReactMarkdown>
      );
    } catch (err) {
      // Fallback to custom inline parser (Approach B) if ReactMarkdown fails
      console.warn("ReactMarkdown rendering failed...", err);
      return <div className="prose prose-sm">{parseMarkdown(text, isUser)}</div>;
    }
  };
```

**What is `ReactMarkdown`?** 
It's a library that safely converts markdown strings into React elements.

**Why the `components={{ ... }}` prop?**
By default, `ReactMarkdown` renders a plain HTML `<p>`. We want our paragraphs to have Tailwind CSS classes for styling (`text-sm`, `leading-relaxed`, etc.). By passing a mapping to the `components` prop, we say: "Whenever you find a paragraph, don't use `<p>`, use MY `<p className="...">` instead."

Notice how the styling changes based on `isUser`. If it's a user bubble (blue background), text is white. If it's an assistant bubble (white background), text is slate-800.

### Part 2 — Grouping Sources by Confidence (Lines 224–244)

```jsx
          {sources && sources.length > 0 && (() => {
            const getScorePercentage = (score) => {
              if (score === undefined || score === null) return 100;
              return score > 1 ? Math.round(score) : Math.round(score * 100);
            };

            const primarySources = [];
            const lowConfidenceSources = [];

            sources.forEach((src) => {
              src._percentage = getScorePercentage(src.score);
              if (src._percentage < 60) {
                lowConfidenceSources.push(src);
              } else {
                primarySources.push(src);
              }
            });
            // ...
```

The backend returns up to 5 source chunks. Each chunk has a `score` from FAISS (e.g., `0.85`).

This code separates the sources into two buckets:
- `primarySources`: Score >= 60%. These are drawn prominently.
- `lowConfidenceSources`: Score < 60%. These are hidden behind a "Show additional lower-confidence sources" toggle button.

This is a **UX (User Experience) decision**. We don't want to overwhelm the user with 5 cards if only 2 of them were highly relevant.

### Part 3 — Rendering the Source Card (Lines 245–312)

```jsx
            const renderSourceCard = (sourceObj, i) => {
              const percentage = sourceObj._percentage;
              const category = sourceObj.category || 'General';
              
              // Left-border styling based on category
              let categoryBorderClass = '';
              const catLower = category.toLowerCase();
              if (catLower.includes('safety regulation')) {
                categoryBorderClass = 'border-l-4 border-l-orange-400';
              } else if (catLower.includes('regulatory')) {
                categoryBorderClass = 'border-l-4 border-l-blue-400';
              } // ...

              return (
                <div key={i} className={`relative border rounded-xl px-3 py-2 text-xs ... ${categoryBorderClass}`}>
                  {/* Score badge */}
                  <span className={`absolute top-2 right-2 font-semibold px-1.5 py-0.5 rounded text-[10px] ...`}>
                    {percentage}% match
                  </span>

                  <div className="pr-16">
                    <span className="font-semibold">{sourceObj.source}</span>
                    <span className="opacity-80"> · {category}</span>
                    <span className="opacity-80"> · Page {sourceObj.page_number}</span>
                  </div>
                  <p className="mt-1 opacity-75 line-clamp-3 pr-4">{sourceObj.preview}</p>
                </div>
              );
            };
```

This function draws one rectangle for a source document. 
- It adds a colored stripe on the left edge depending on the `category` string.
- It displays the `% match` badge in the top right.
- It shows the filename, category, and page number.
- It shows a short preview of the text, clamped to 3 lines (`line-clamp-3`).

### Part 4 — The Feedback Buttons (Lines 342–376)

```jsx
          {/* Feedback Buttons */}
          {!isUser && !blocked && !rate_limited && (
            <div className="flex gap-2 items-center text-xs ml-1 mt-1">
              <span className="text-slate-400">Helpful?</span>
              <button 
                onClick={async () => {
                  if (feedbackState) return;
                  setFeedbackState('positive');
                  await submitFeedback(query || "", mainContent, sources || [], true);
                }}
                disabled={feedbackState !== null}
                className={`... ${feedbackState === 'positive' ? 'text-green-600 bg-green-50' : 'text-slate-400'}`}
              >
                <svg>...</svg> {/* Thumbs up icon */}
              </button>
              // ... thumbs down button (false)
            </div>
          )}
```

Only assistant bubbles get these buttons (`!isUser`). 

When clicked, they call `submitFeedback` (from `client.js`), which makes a POST request to `/feedback`. This logs the user's question, the AI's answer, the sources used, and whether it was a thumbs up/down. This log is crucial for the developers to see where the bot is failing so they can improve the FAISS chunks or the system prompt.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **Markdown** | A lightweight markup language used to format text (e.g., `**bold**`, `* list`). |
| **ReactMarkdown** | A library that parses markdown and renders it as React components. |
| **Tailwind CSS** | A utility-first CSS framework. Classes like `mt-1` (margin-top), `text-sm` (small text), and `line-clamp-3` (truncate after 3 lines) style the elements directly in the JSX. |
| **UX (User Experience)** | Designing interfaces that are easy and pleasant to use (e.g., hiding low-confidence sources behind a toggle). |

---

## Try It Yourself

### Exercise 1 — Change the Source Card Colors
In `ChatMessage.jsx`, find the `renderSourceCard` function (around line 251). Change the colors for the categories:
```jsx
              if (catLower.includes('safety regulation')) {
                categoryBorderClass = 'border-l-4 border-l-purple-500'; // ← Changed to purple
              }
```
Ask a question about safety regulations and see the purple stripe appear.

### Exercise 2 — Disable the Thumbs Up Button
In the `button` tag for the thumbs up (around line 352), add the `disabled` attribute directly:
```jsx
              <button 
                disabled={true} // ← ADD THIS
                onClick={async () => { ... }}
```
Now the thumbs up button cannot be clicked.

---

## What's Next

You've made it! You've traced a single question from the user's keyboard, over the network, through the Python backend, into the vector database, up to the LLM, back across the network, and onto the screen.

In **[Stage 10](./10-tying-it-together.md)**, we will tell the complete story of a single question, tying everything together into one narrative.
