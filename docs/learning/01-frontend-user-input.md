# Stage 1 — Frontend: User Input

> **Where we are in the flow:**  
> `[USER TYPES] → Chat.jsx captures input → state updates → UI re-renders`

---

## Architecture Diagram — Stage 1

```
╔══════════════════════════════════════════════════════════════════╗
║                    BROWSER (React App)                           ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │                     Chat.jsx                  ← YOU ARE  ║   ║
║   │                                                  HERE    ║   ║
║   │  useState([messages])   ◄──── stores all chat bubbles   ║   ║
║   │  useState(input)        ◄──── stores current typed text ║   ║
║   │  useState(isLoading)    ◄──── true while waiting for AI ║   ║
║   │                                                          ║   ║
║   │   ┌──────────────────────────────────┐                  ║   ║
║   │   │  <textarea>                      │                  ║   ║
║   │   │  User types here                 │                  ║   ║
║   │   │  onKeyDown → handleKeyDown()     │                  ║   ║
║   │   │  onChange  → handleChange()      │                  ║   ║
║   │   └──────────────────────────────────┘                  ║   ║
║   │                                                          ║   ║
║   │   ┌──────────────────────────────────┐                  ║   ║
║   │   │  <button> Send                   │                  ║   ║
║   │   │  onClick  → sendMessage()        │                  ║   ║
║   │   └──────────────────────────────────┘                  ║   ║
║   │                                                          ║   ║
║   │   messages.map(msg => <ChatMessage ... />)               ║   ║
║   │                                                          ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              ChatMessage.jsx                            ║   ║
║   │   Renders each chat bubble (user or assistant)          ║   ║
║   │   Also renders: source cards, feedback buttons          ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
                          │
                          │  (next: Stage 2 — API call leaves the browser)
                          ▼
                    [ NETWORK ]
```

---

## What This Stage Does and WHY It Exists

The Chat page is the user's entire window into PolicyIQ. It needs to do three things:
1. **Capture** what the user typed.
2. **Remember** the conversation so far (all the bubbles).
3. **Show feedback** while the AI is thinking (the bouncing dots).

None of this involves the backend yet. This is purely about the browser managing its own "memory" of what's on screen.

---

## The Real Code, Annotated

**File:** [`frontend/src/pages/Chat.jsx`](file:///Users/savyaraj/Desktop/policyiq/frontend/src/pages/Chat.jsx)

### Part 1 — The State Variables (Lines 14–19)

```jsx
// Line 14
const [messages, setMessages] = useState([]);
// Line 15
const [sessionId, setSessionId] = useState(null);
// Line 16
const [input, setInput] = useState('');
// Line 17
const [isLoading, setIsLoading] = useState(false);
```

**What is `useState`?**

Think of `useState` as React's way of giving a component its own "memory". Every time you call `useState(initialValue)`, you get back a pair:
- The **current value** (e.g., `messages` — starts as an empty array `[]`)
- A **setter function** (e.g., `setMessages`) — call this to change the value

When you call the setter, React automatically redraws the component with the new value. This is the core idea of React: **UI = f(state)** — your interface is just a function of your data.

| State variable | What it holds | Initial value |
|---------------|---------------|---------------|
| `messages` | Array of all chat messages (user + assistant) | `[]` (empty) |
| `sessionId` | A UUID string the backend uses for conversation memory | `null` (no session yet) |
| `input` | Whatever text is currently in the textarea | `''` (empty string) |
| `isLoading` | `true` while waiting for the AI response | `false` |

### Part 2 — Auto-scroll (Lines 21–23 and Line 174)

```jsx
const bottomRef = useRef(null);

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, isLoading]);
```

```jsx
// Way down in the JSX (line 174):
<div ref={bottomRef} />
```

**What is `useRef`?** A ref is a way to get a direct handle to a DOM element (an actual HTML element in the page). `bottomRef.current` points to the invisible `<div>` at the bottom of the message list.

**What is `useEffect`?** It lets you run a side-effect whenever certain values change. Here: every time `messages` or `isLoading` changes (i.e., whenever a new message appears or the spinner shows/hides), it smoothly scrolls to the bottom.

**Why `?.` (optional chaining)?** Because on the very first render, `bottomRef.current` might be `null` (the div hasn't been drawn yet). The `?.` says "only call `.scrollIntoView` if `bottomRef.current` is not null/undefined."

### Part 3 — The Auto-resize Textarea (Lines 25–36)

```jsx
const handleResize = () => {
  const el = textareaRef.current;
  if (el) {
    el.style.height = 'auto';      // reset first
    el.style.height = el.scrollHeight + 'px';  // expand to content
  }
};

const handleChange = (e) => {
  setInput(e.target.value);   // update state with new text
  handleResize();              // grow textarea if needed
};
```

This makes the textarea grow vertically as you type multiple lines. The trick: reset the height to `'auto'` first, then set it to `scrollHeight` (the total content height). Without the reset, the height only grows and never shrinks.

### Part 4 — The `sendMessage` Function (Lines 38–89)

This is the most important function in the whole frontend. Read it carefully.

```jsx
const sendMessage = async (question) => {
  const q = question || input.trim();  // use argument or current textarea
  if (!q || isLoading) return;         // guard: don't send empty or during load

  setInput('');         // clear the textarea immediately
  // ... reset textarea height ...

  // ADD user's message to the messages array RIGHT NOW (optimistic update)
  setMessages((prev) => [...prev, { role: 'user', content: q, sources: null, rate_limited: false }]);
  setIsLoading(true);   // show the bouncing dots

  try {
    const result = await askQuestion(q, sessionId);  // ← Stage 2 happens here
    if (result.session_id) setSessionId(result.session_id);
    
    // ADD assistant's response to messages
    setMessages((prev) => [
      ...prev,
      { 
        role: 'assistant', 
        content: result.answer, 
        sources: result.source_documents ?? [],
        rate_limited: result.rate_limited,
        blocked: result.blocked ?? false,
        block_reason: result.block_reason ?? "",
        query: q
      },
    ]);
  } catch (err) {
    // ... handle errors (Stage 8 connects here)
  } finally {
    setIsLoading(false);  // always hide the dots when done
  }
};
```

**Key observations:**

1. **`async` function** — This function will "pause" at the `await` keyword (waiting for the network) without freezing the browser. More in Stage 2.

2. **`setMessages((prev) => [...prev, newMessage])`** — Notice the pattern: pass a *function* to `setMessages` instead of a value. That function receives `prev` (the current array) and returns a new array with the new message appended. The `...prev` (spread operator) copies all existing messages; then the new one is added at the end. This is necessary because React state updates can be batched — using the function form guarantees you always have the latest `prev`.

3. **Optimistic update** — The user's message is shown immediately, *before* the API call finishes. This makes the UI feel instant even though the AI might take 5+ seconds. When the response comes back, the assistant's bubble is added.

4. **`finally` block** — `setIsLoading(false)` is in the `finally` block, not the `try` or `catch`. This guarantees the spinner is hidden whether the call succeeds or fails.

### Part 5 — Keyboard Handler (Lines 91–96)

```jsx
const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();   // don't insert a newline
    sendMessage();
  }
};
```

**Why `!e.shiftKey`?** This is a common UX pattern: plain Enter = send; Shift+Enter = new line. Without `!e.shiftKey`, you couldn't write multi-line questions.

**Why `e.preventDefault()`?** Normally, Enter inside a textarea inserts a newline character. `preventDefault()` cancels that default browser behavior before calling `sendMessage()`.

### Part 6 — The Suggested Questions (Lines 6–10, 133–141)

```jsx
const SUGGESTED = [
  'What is the minimum safe distance for LPG storage near a process unit?',
  'What are the fire hydrant inspection intervals per OISD-141?',
  'What pressure limits apply to petroleum pipelines?',
];

// In JSX:
{SUGGESTED.map((q) => (
  <button key={q} onClick={() => sendMessage(q)}>
    {q}
  </button>
))}
```

These buttons call `sendMessage(q)` with a hard-coded question string — same function, just bypassing the textarea. The `key={q}` tells React how to identify each button when re-rendering.

---

## The ChatMessage Component

**File:** [`frontend/src/components/ChatMessage.jsx`](file:///Users/savyaraj/Desktop/policyiq/frontend/src/components/ChatMessage.jsx)

`ChatMessage` receives props from `Chat.jsx` and draws one chat bubble. In Stage 1, we care about its role in the "before sending" state — the initial empty screen. But here's its shape:

```jsx
export default function ChatMessage({ role, content, sources, rate_limited, blocked, block_reason, query }) {
```

**Props** are like function arguments for React components. `Chat.jsx` passes data down to `ChatMessage` via props; `ChatMessage` just renders what it receives.

### The `isUser` decision

```jsx
const isUser = role === 'user';
```

A single boolean drives the entire visual difference between a user bubble (right-aligned, blue) and an assistant bubble (left-aligned, white). Nearly every CSS class in the component is conditioned on `isUser`.

### The blocked / rate_limited early returns (Lines 56–148)

```jsx
if (blocked) {
  return ( <div className="bg-red-50 ...">🛡️ Query Blocked</div> );
}
if (rate_limited) {
  return ( <div className="bg-amber-50 ...">⚠️ Rate limit reached</div> );
}
```

These are "guard clauses" — if a special condition is true, render a special card and return early instead of the normal bubble. This prevents the rest of the component from having to wrap everything in `if/else` branches.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **React component** | A JavaScript function that returns JSX (HTML-like syntax). `Chat` and `ChatMessage` are both components. |
| **JSX** | A syntax extension that lets you write HTML-looking code inside JavaScript. It compiles to `React.createElement()` calls. |
| **useState** | A React hook that gives a component a piece of "memory". Returns `[value, setter]`. |
| **useEffect** | A React hook that runs side-effects after renders. Dependencies list tells it when to re-run. |
| **useRef** | A React hook that gives a stable reference to a DOM element (or any value) that doesn't trigger re-renders. |
| **props** | Values passed from a parent component to a child, like function arguments. Read-only in the child. |
| **async/await** | JavaScript syntax for pausing a function at an `await` without blocking the browser. Returns a Promise. |
| **spread operator (`...`)** | `[...prev, newItem]` makes a new array by copying all items from `prev` then adding `newItem`. |
| **event object (`e`)** | The object passed to event handlers. `e.key`, `e.target.value`, `e.preventDefault()` are commonly used properties. |

---

## Try It Yourself

These are small, safe changes you can make to see how things work:

### Exercise 1 — Add a fourth suggested question
In `Chat.jsx`, add a string to the `SUGGESTED` array (lines 6–10):

```jsx
const SUGGESTED = [
  'What is the minimum safe distance for LPG storage near a process unit?',
  'What are the fire hydrant inspection intervals per OISD-141?',
  'What pressure limits apply to petroleum pipelines?',
  'What are the inspection requirements for LPG cylinder storage?',  // ← ADD THIS
];
```

Save the file. Vite hot-reloads instantly. You should see a fourth button on the empty chat screen.

### Exercise 2 — Log every message to the console
At the top of `sendMessage`, add:

```jsx
const sendMessage = async (question) => {
  console.log('sendMessage called with:', question || input.trim());  // ← ADD THIS
  const q = question || input.trim();
```

Open the browser DevTools (Cmd+Option+I on Mac), go to the Console tab, and watch it fire every time you send.

### Exercise 3 — Change the "Clear chat" button text
On line 116 of `Chat.jsx`, change `Clear chat` to `New conversation`. Notice how this instantly appears on save — no restart needed.

---

## Common Beginner Mistakes at This Stage

1. **Mutating state directly** — Writing `messages.push(newMessage)` does NOT trigger a re-render. React only re-renders when you call the setter (`setMessages`). Always create a new array.

2. **Missing the spread operator** — Writing `setMessages([newMessage])` replaces the whole array with just one message. You need `setMessages([...prev, newMessage])` to append.

3. **Calling `sendMessage` without `async`** — If you remove `async`, the `await askQuestion(...)` will return a Promise object instead of the actual data. Always pair `async` with `await`.

4. **Confusing props and state** — Props come FROM above (parent → child). State is OWNED by the component. `ChatMessage` receives `content` as a prop; `Chat` owns the `messages` state.

5. **Wondering why JSX uses `className` instead of `class`** — In HTML it's `class`. In JSX it's `className` because `class` is a reserved word in JavaScript.

---

## What's Next

In **[Stage 2](./02-frontend-api-call.md)**, we follow the `await askQuestion(q, sessionId)` call from line 55 of `Chat.jsx` into `client.js` and watch the HTTP request get built and sent to the backend.
