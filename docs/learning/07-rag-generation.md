# Stage 7 — RAG Pipeline: Generation

> **Where we are in the flow:**  
> `Retriever returns chunks → pipeline.py formats prompt → Groq API called → answer generated`

---

## Architecture Diagram — Stage 7

```
╔══════════════════════════════════════════════════════════════════╗
║                  BACKEND (generator.py & pipeline.py)            ║
║                                                                  ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/pipeline.py                             ║   ║
║   │                                                          ║   ║
║   │   1. Format Context Chunks                               ║   ║
║   │      Chunk 1: [Source: OISD-144] "LPG vessels..."        ║   ║
║   │      Chunk 2: [Source: PESO] "Minimum distance..."       ║   ║
║   │      ...                                                 ║   ║
║   │                                                          ║   ║
║   │   2. Construct Final Prompt                              ║   ║
║   │      SYSTEM_PROMPT + Formatted Chunks + User Question    ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │                              ║
║                               ▼                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/generator.py              ← YOU ARE    ║   ║
║   │                                              HERE        ║   ║
║   │  SYSTEM_PROMPT = """You are PolicyIQ...                 ║   ║
║   │  RESPONSE FORMAT RULES:                                  ║   ║
║   │  1. Always lead with the direct answer...                ║   ║
║   │  2. Cite your source inline..."""                        ║   ║
║   └───────────────────────────┬─────────────────────────────┘   ║
║                               │  prompt string sent to API   ║
║                               ▼                              ║
║                      [ Groq Cloud ]                          ║
║                    Llama 3.3 70B Model                       ║
║                               │  answer string returned      ║
║                               ▼                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │              rag/pipeline.py                             ║   ║
║   │                                                          ║   ║
║   │  result["answer"] = "**15 metres** is the..."            ║   ║
║   └─────────────────────────────────────────────────────────┘   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## What This Stage Does and WHY It Exists

We have the user's question. We have 5 highly relevant paragraphs from the FAISS database. Now we need the AI to actually write the answer.

This stage is all about **Prompt Engineering**. 

An LLM is a text-prediction engine. If you just paste 5 paragraphs and a question, it might answer vaguely, it might ignore the paragraphs and use its pre-training data, or it might format the answer in a way the frontend isn't expecting.

We use a "System Prompt" to explicitly instruct the LLM on its persona, formatting rules, and constraints (e.g., "Never contradict a cited source").

---

## The Real Code, Annotated

**File:** [`backend/rag/generator.py`](file:///Users/savyaraj/Desktop/policyiq/backend/rag/generator.py)

### Part 1 — The System Prompt (Lines 10–28)

```python
SYSTEM_PROMPT = """You are PolicyIQ, an expert compliance assistant for Indian Oil \
Corporation Limited (IOCL). You answer questions about Indian oil and gas safety regulations \
including OISD standards, PESO rules, PNGRB regulations, and related documents.

RESPONSE FORMAT RULES — FOLLOW STRICTLY:
1. Always lead with the direct answer or key regulatory figure (distance, rate, requirement) in BOLD before any explanation.
2. Use bullet points or a markdown table when comparing multiple values, standards, or facility types.
3. Cite your source inline like: [OISD-STD-144, Page 25] — not at the end of a paragraph.
4. Give ONE disclaimer maximum per response, placed at the very end, only if genuinely needed. Never repeat disclaimers mid-response.
5. If the answer involves a boundary/edge case (e.g., "exactly X"), explicitly state which range it falls into and why, with the specific standard text that defines the boundary.
6. If the retrieved context is insufficient to answer completely, say: "The available documents do not fully cover this — specifically [gap]. For this, consult [specific standard]." Do NOT give a vague non-answer.
7. For multi-part questions, answer each part with a numbered sub-heading.
8. Keep responses under 300 words unless the question genuinely requires more detail.

ACCURACY RULES:
- Range boundaries are INCLUSIVE of the upper bound unless explicitly stated otherwise. A vessel of exactly 20 Cu. Mt. falls in the "10–20" range, NOT the "20–40" range.
- Never contradict a cited source. If two sources conflict, state the conflict explicitly.
- Never invent regulatory figures not present in retrieved chunks.
"""
```

**Why these specific rules?**
- **Rule 1** prevents the AI from starting every answer with a robotic "Based on the provided context..." It forces the AI to put the most important information first (Bottom-Line Up Front).
- **Rule 3** ensures the frontend has something specific to show the user.
- **Rule 6** is the anti-hallucination rule. It gives the AI permission to say "I don't know," which LLMs are notoriously bad at doing unless explicitly ordered to.
- **The Accuracy Rules** address specific quirks seen in Llama 3 testing, where it struggled with inclusive vs. exclusive number ranges in safety tables.

### Part 2 — Context Stuffing (in `pipeline.py`)

How do the retrieved chunks actually get attached to the System Prompt? We saw this briefly in Stage 5, but let's look closer.

**File:** [`backend/rag/pipeline.py`](file:///Users/savyaraj/Desktop/policyiq/backend/rag/pipeline.py) (Lines 97–107)

```python
    # Note: LangChain's ConversationalRetrievalChain formats {context} by joining
    # chunk page_content strings. To include metadata we override the document
    # prompt so each chunk is rendered as "[Source: <file> | <category> | chunk <n>]\n<text>".
    doc_prompt = PromptTemplate(
        input_variables=["page_content", "source", "page", "section"],
        template="[Source: {source} | Page: {page} | Section: {section}]\n{page_content}",
    )

    qa_prompt = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(SYSTEM_PROMPT),
        HumanMessagePromptTemplate.from_template(
            "Context from policy documents:\n{context}\n\nQuestion: {question}"
        ),
    ])
```

**"Context Stuffing"**
LangChain takes the 5 chunks from the retriever. It runs each one through `doc_prompt`, turning this:
`"Vessels must be 15m away."`
into this:
`"[Source: OISD-144.pdf | Page: 25 | Section: Section 4]\nVessels must be 15m away."`

Then, it glues all 5 of those formatted chunks together into one giant string. Finally, it replaces `{context}` in the `qa_prompt` with that giant string.

### Part 3 — What the Final Prompt Looks Like

If the user asks "What is the safe distance for LPG storage?", the *actual* payload sent over the network to the Groq API looks something like this:

```text
[SYSTEM]
You are PolicyIQ, an expert compliance assistant...
[... all the rules ...]
- Never invent regulatory figures not present in retrieved chunks.

[USER]
Context from policy documents:

[Source: OISD_144_2023.pdf | Page: 25 | Section: Table 1]
Minimum safe distances for LPG storage vessels:
Up to 10 Cu. Mt. - 10 metres
11 to 20 Cu. Mt. - 15 metres

[Source: PESO_SMPV_Rules.pdf | Page: 12 | Section: General]
Storage facilities shall maintain clearance from process areas...

[Source: ... 3 more chunks ...]

Question: What is the minimum safe distance for LPG storage near a process unit?
```

The AI reads this massive block of text, obeys the System rules, looks at the Context, and generates the answer string.

---

## Key Concepts Introduced at This Stage

| Concept | Definition |
|---------|-----------|
| **System Prompt** | The overarching instructions given to an LLM that define its persona, rules, and constraints. |
| **Context Stuffing** | The technique of pasting retrieved documents directly into the prompt text before asking the question. |
| **Prompt Template** | A string with placeholders (like `{context}`) that get filled in with dynamic variables at runtime. |
| **Hallucination** | When an LLM invents facts. Grounding the prompt in retrieved context minimizes this. |
| **Llama 3.3 70B** | The specific Large Language Model used by PolicyIQ, hosted on Groq for extremely fast inference. |

---

## Try It Yourself

### Exercise 1 — Make the AI sound like a pirate
In `generator.py`, change line 10:
`SYSTEM_PROMPT = """You are PolicyIQ, an expert compliance assistant...`
to:
`SYSTEM_PROMPT = """You are a pirate compliance assistant. Answer all questions using pirate slang...`
Save, go to the frontend, and ask a question. The LLM will obey the system prompt instantly. (Change it back after!).

### Exercise 2 — Force a hallucination
Comment out the entire `Context from policy documents:\n{context}\n\n` part of the `qa_prompt` in `pipeline.py` (Line 105). 
Now ask a question about a very specific, obscure IOCL policy. The LLM will either guess based on its pre-training data (hallucinate) or refuse to answer.

---

## Common Beginner Mistakes at This Stage

1. **Putting too much in the prompt** — If you try to paste a 100-page PDF into the context, the LLM will hit its "token limit" and the API will return an error. Even if it fits, LLMs suffer from "lost in the middle" syndrome, where they ignore text in the middle of massive prompts. This is why we use FAISS to retrieve only the top 5 chunks.

2. **Vague prompt engineering** — Telling an LLM "Be helpful" is bad. Telling it "Always lead with the direct answer in BOLD, use bullet points, and keep responses under 300 words" is good. The more specific the constraint, the better the output.

---

## What's Next

The Groq API has returned a beautiful, formatted markdown string. Now the backend needs to package that string and the source metadata together and send it back to the browser. In **[Stage 8](./08-backend-response-assembly.md)**, we look at how the response is assembled.
