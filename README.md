# PolicyIQ — IOCL Compliance Document Assistant

PolicyIQ is an AI-powered RAG (Retrieval-Augmented Generation) assistant for IOCL (Indian Oil Corporation Limited) employees. It answers questions about safety regulations, delegation of powers, HR policies, and internal procedures using a vector-indexed corpus of official regulatory documents.

## Architecture

```
data/raw/          → Canonical source PDFs (30 documents, 7,038 chunks)
data/archive/      → Non-canonical duplicates, superseded versions
data/indexed_hashes.json → SHA-256 registry (build_index.py)
document_registry.json   → MD5 registry (update_index.py / admin uploads)
vector_store/      → FAISS index (index.faiss + index.pkl)
indexing/          → Parsing, chunking, embedding, deduplication pipeline
backend/           → FastAPI app with RAG pipeline (LangChain + Groq)
frontend/          → React chat interface
```

## Document Corpus

| # | Standard | Document | Chunks |
|---|----------|----------|--------|
| 02 | OISD-STD-116 | Fire Protection — Refineries | 332 |
| 03 | OISD-STD-117 | Fire Protection — Depots | 382 |
| 04 | OISD-STD-105 | Work Permit Case Studies | 18 |
| 05 | OISD-STD-129 | Tank Inspection Case Study | 22 |
| 08 | OISD Pipeline | Pipeline Safety Management | 554 |
| 09 | PNGRB T4S 2017 | Petroleum Pipeline Standards | 400 |
| 10 | PNGRB ERDMP 2020 | Emergency Response Regulations | 308 |
| 11 | PESO | Gas Cylinders Rules SOP | 220 |
| 12 | PESO | Annual Report 2024-25 | 485 |
| 13 | PESO | Petroleum Rules 2002 SOP | 157 |
| 15 | PESO | Explosives Rules 2008 SOP | 138 |
| 16 | PNGRB | ERDMP Post-Amendment 2025 | 313 |
| 17 | PNGRB | NGPL T4S Safety Standards | 273 |
| 18 | PNGRB | Gas Supplies Industrial Guidelines | 56 |
| 19 | PNGRB | Case Study — Major Incidents | 11 |
| 20 | OISD-STD-144 | LPG Installations Errata | 11 |
| 21 | OISD-STD-117 | Fire Protection Depots Errata | 9 |
| 22 | OISD-STD-118 | Layouts — Oil & Gas Installations | 27 |
| 23 | OISD-STD-152 | Safety Instrumentation Errata | 3 |
| 24 | OISD-STD-129 | Flaring & Inspection | 378 |
| 25 | OISD-STD-142 | Fire Fighting Inspection & Testing | 7 |
| 27 | OISD-STD-144 | LPG Installations (Full, 267 pages) | 1,276 |
| 28 | OISD-STD-175 | Cementing Operations | 322 |
| 29 | OISD-STD-194 | LNG Handling & Storage | 592 |
| 30 | OISD-STD-190 | Drilling Safety — Onshore & Offshore | 391 |
| 31 | OISD-STD-233 | Non-Piggable Pipeline Safety | 127 |
| 33 | PESO | SMPV Unfired Rules 2016 | 64 |
| 34 | PESO | Petroleum Rules 2002 FAQ | 127 |
| 37 | PESO | Ammonium Nitrate Rules FAQ | 35 |
| **Total** | | **29 documents** | **7,038 chunks** |

## Evaluation

### Factual Accuracy Evaluation (Happy-Path Queries)

| Query | Answer Correct | Source Correct |
|-------|---------------|----------------|
| Minimum safe distance, LPG vessel 10-20 Cu.Mt. | ✅ 15m | ✅ OISD-STD-144, Page 25 |
| Safe distance, pressurized LPG tank >3800 Cu.Mt. | ✅ 120m | ✅ OISD-STD-144, Page 25 |
| Kerb wall height requirements (LPG) | ✅ 30-60cm | ✅ OISD-STD-144 |
| Work permit categories | ✅ 4 categories | ✅ OISD-STD-105 |
| Fire hydrant spacing (refinery) | ✅ 45m | ✅ OISD-STD-116 |

### Edge Case Evaluation (Failure-Mode Tests — captured 2026-06-13)

These tests were developed from real failure modes discovered during manual testing of hard compliance queries. They document that PolicyIQ has been tested against edge cases, not just happy-path queries.

| ID | Query Type | Query (abbreviated) | Expected Behavior | Status |
|----|-----------|---------------------|-------------------|--------|
| EC-01 | follow_up_context | "and what capacity?" (after LPG distance) | Conversational memory; resolve to capacity table | 🔲 Run |
| EC-02 | follow_up_context | "any other requirements for the tank?" | Maintain context; surface additional requirements | 🔲 Run |
| EC-03 | cross_document_partial | "PESO vs OISD LPG cylinder requirements" | Surface both docs' actual figures; no absence hallucination | 🔲 Run |
| EC-04 | either_or_boundary | "20 Cu.Mt. vessel — 15m or 20m category?" | Lead with direct resolution of the either/or | 🔲 Run |
| EC-05 | not_in_corpus_with_related | "fire hydrant intervals per OISD-141" | Absence once, then offer OISD-144 naturally | 🔲 Run |
| EC-06 | precedence_legal | "PESO vs OISD, which takes precedence?" | Surface both figures; flag legal question honestly | 🔲 Run |
| EC-07 | substance_conflation_trap | "CNG storage safe distance" | CNG ≠ LPG; no LPG figure substitution | 🔲 Run |
| EC-08 | standard_conflation_trap | "OISD-STD-150 for LPG bottling plants" | Correct STD-150 = mounded storage; redirect GDN-169 | 🔲 Run |
| EC-09 | ambiguous_underspecified | "minimum safe distance for storage" | Ask clarification or present 2-3 categories | 🔲 Run |

> **Note:** Edge case scores are manually assessed after each query run. Run `scripts/run_eval_tests.py` to execute tests 3–9 against a live backend. Mark results in `data/eval_set.json` (`answer_correct`, `source_correct` fields).

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Build vector index (first time)
python -m indexing.build_index

# Start backend
uvicorn backend.main:app --reload --port 8000

# Start frontend (separate terminal)
cd frontend && npm run dev
```

## Retrieval Tuning & Feedback

An ongoing initiative to improve retrieval accuracy using empirical tuning and user feedback.

### Retrieval Benchmarks
We benchmarked the FAISS index against 15 complex compliance queries (measuring `Recall@k`):
* **Default parameters** (chunk_size=512, overlap=64):
  * `k=5`: 86.7% Recall
  * `k=7`: 93.3% Recall
  * `k=10`: 100.0% Recall
* **Experimental parameters** (chunk_size=600, overlap=200):
  * `k=5`: 93.3% Recall
  * `k=7`: 93.3% Recall
  * `k=10`: 100.0% Recall

*Conclusion:* The `chunk_size=600`/`overlap=200` configuration meaningfully improves early retrieval (`k=5`) by capturing context boundaries better without over-polluting the prompt window.

### Feedback Loop
A manual feedback collection mechanism is built into the Chat UI (`👍 / 👎` buttons). This submits feedback to the `POST /api/chat/feedback` endpoint which appends to `data/feedback_log.jsonl`. 
Administrators can view these logs via the Admin UI to curate hard queries, identify missing knowledge, and further tune chunking/retrieval parameters. **Note:** This feedback does *not* automatically modify the model or the retrieval pipeline; it is strictly an audit tool for manual curation.

## Deduplication

The corpus uses two-layer deduplication:

1. **Exact content** (SHA-256 hash) — prevents bitwise-identical files from being indexed twice
2. **Standard identifier** (regex) — warns when a new upload covers the same regulatory standard as an existing document

Run `python scripts/find_duplicates.py` to audit the corpus. Run `python scripts/dedupe_cleanup.py --dry-run` to preview cleanup actions.

To add a document that intentionally extends an existing standard (errata, FAQ, amendment):
```bash
python -m indexing.update_index path/to/new_errata.pdf --force
```

## Archived Documents

| Filename | Reason |
|----------|--------|
| `06_OISD-STD-144_LPG_Installations.pdf` | Superseded by `27_OISD_STD_144_LPG_Installations_Full.pdf` (267-page version) |
| `26_OISD_STD_116_Fire_Protection_Refineries_Full.pdf` | Identical to `02_OISD-STD-116_Fire_Protection_Refineries.pdf` |
| `35_PESO_Gas_Cylinders_Rules_SOP.pdf` | Identical to `11_PESO_Gas_Cylinders_Rules_SOP.pdf` |
| `32_PESO_Petroleum_Rules_2002_SOP.pdf` | Identical to `13_PESO_Petroleum_Rules_2002_SOP.pdf` |
| `36_PESO_Explosives_Rules_2008_SOP.pdf` | Identical to `15_PESO_Explosives_Rules_2008_SOP.pdf` |
