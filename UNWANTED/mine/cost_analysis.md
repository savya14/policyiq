# PolicyIQ — Cost & Free-Tier Reality Check
### Brutally Honest. No Marketing Spin.

> Blueprint claims: **Total cost = ₹0**  
> Reality: **More nuanced than that.**

---

## Verdict First

# ⚠️ Mostly Free — With Conditions That Will Actually Affect You

The system *can* run for ₹0/month. But the blueprint's "Total: ₹0" table is written by someone who never hit a rate limit during a live demo, never had a recruiter click a dead HF Spaces link, and never thought about what happens when Groq's free tier changes. Here's the full picture.

---

## Component-by-Component Breakdown

---

### 1. Groq (LLM Provider)

**Blueprint claim:** ₹0  
**Reality:** ⚠️ Free with hard limits that will visibly affect you

**Verified current limits for LLaMA 3.3 70b Versatile (free tier):**

| Limit | Value | Practical meaning |
|-------|-------|-------------------|
| Requests per day (RPD) | **1,000** | 1,000 queries/day maximum |
| Tokens per minute (TPM) | **12,000** | ~5–6 concurrent users |
| Requests per minute (RPM) | ~30 | Demo under load will hit this |

**Token math — what 1,000 requests/day actually means:**

A single PolicyIQ query consumes approximately:
- User query: ~20 tokens
- Retrieved context (5 chunks × ~200 tokens): ~1,000 tokens
- System prompt: ~200 tokens
- Generated answer: ~400–600 tokens
- **Total: ~1,800–2,000 tokens per query**

| Scenario | Queries before daily limit |
|----------|---------------------------|
| Normal portfolio browsing | 1,000 queries — fine |
| Recruiter shares link on social media | Limit hit in hours |
| Hackathon judging (10 judges × 30 queries) | 300 queries — fine |
| Interviewer live demo + 5 follow-up sessions | Fine |
| App goes viral (unlikely but possible) | Breaks same day |

**The real risk:** The 30 RPM limit (not the daily limit) is what hits during demos. Three people using the app simultaneously, each clicking "send" within the same minute, will trigger rate limit errors. The retry logic with exponential backoff helps but adds 10–30 seconds of visible lag.

**The hidden risk nobody mentions:** Groq is a startup. Their free tier exists to drive adoption. If they change pricing or tighten free limits (as happened with many AI APIs in 2023–2024), the entire project breaks overnight with no warning. You have no contractual free-tier guarantee.

**Verdict:** Free for solo portfolio use. Not free under any real load.

---

### 2. Hugging Face Spaces (Hosting)

**Blueprint claim:** ₹0  
**Reality:** ⚠️ Free, but the UX is genuinely bad on the free tier

**Verified current free tier specs:**

| Feature | Free tier |
|---------|-----------|
| RAM | 16 GB |
| CPU | 2 vCPUs |
| Ephemeral disk | 50 GB |
| Repo/Git storage | ~1 GB |
| GPU | Not included (ZeroGPU available for Gradio only) |
| **Sleep after inactivity** | **Yes — always-on not free** |

**The sleep problem is the most significant real-world impact:**

HF Spaces free tier sleeps after ~15 minutes of inactivity. When someone clicks your demo link after it's been idle:

1. Space wakes up: **~30–60 seconds**
2. Python process restarts: **~5 seconds**
3. `@st.cache_resource` cache is empty — first query triggers FAISS load + model check: **~8 seconds**
4. Groq API call: **~5 seconds**
5. **Total time from click to first answer: 48–78 seconds**

A recruiter who clicks your demo link from your resume PDF and waits 60 seconds before seeing a loading spinner will **close the tab**. This is not a theoretical concern — it is the most common reason portfolio ML projects fail to impress.

**Storage constraint:**
The ~1 GB repo limit on HF Spaces is not for ephemeral disk — it's for the Space's own git repository. Your FAISS index files (`index.faiss` + `index.pkl`) for 8–12 PDFs will be roughly 10–50 MB. Comfortable now, but every corpus expansion commits new binary versions. Watch this.

**Cost to fix the sleep problem:** HF Spaces Pro hardware starts at **$9/month** for always-on CPU Spaces. This is the honest cost of a non-embarrassing demo.

---

### 3. GitHub (Source Code + Binary Index Storage)

**Blueprint claim:** ₹0 (implied — not listed separately)  
**Reality:** ✅ Free, with an important LFS caveat

**Verified GitHub LFS free tier:**

| Resource | Free allowance |
|---------|---------------|
| LFS Storage | **10 GB/month** |
| LFS Bandwidth | **10 GB/month** |
| Max file size | 2 GB |

**Why bandwidth matters more than storage for this project:**

Every time HF Spaces cold-starts (which happens after every 15-minute idle period), it pulls the repo — including LFS files (`index.faiss`, `index.pkl`). If your index is 30 MB and HF Spaces cold-starts 10 times/day (one sleep cycle every ~2.5 hours of inactivity), that's **300 MB/day of LFS bandwidth** — or **9 GB/month**. Very close to the 10 GB free limit.

If you share the app publicly and multiple people visit it throughout the day, cold starts accumulate faster.

**What happens when you exceed the LFS limit:**
- If you set your budget to $0 in GitHub settings: LFS pulls are blocked. HF Spaces cannot clone the repo. **Your app goes down.**
- If you don't set a budget: GitHub charges the overage. The rate is metered.

**Mitigation:** Set your GitHub LFS budget to $0 explicitly. If you get blocked, you'll know about it and can intervene rather than getting an unexpected bill.

**Verdict:** Free for low-traffic portfolio use. Has a real failure mode if traffic spikes or cold starts accumulate.

---

### 4. sentence-transformers / all-MiniLM-L6-v2 (Embeddings)

**Blueprint claim:** ₹0  
**Reality:** ✅ Genuinely free. No caveats.

The model is open-source (Apache 2.0), runs locally, no API calls, no per-query cost. The 80 MB download is from HuggingFace Hub — also free. This is the one component in the stack with zero hidden costs.

---

### 5. FAISS (Vector Store)

**Blueprint claim:** ₹0 (files in GitHub)  
**Reality:** ✅ Free, but see GitHub LFS caveat above

FAISS itself is free and open-source (MIT license). The storage cost is absorbed by GitHub LFS. No per-query charges, no external service dependency.

---

### 6. Python Libraries (All Dependencies)

**Blueprint claim:** Not explicitly listed as a cost  
**Reality:** ✅ All free

| Library | License | Cost |
|---------|---------|------|
| LangChain | MIT | Free |
| FAISS | MIT | Free |
| sentence-transformers | Apache 2.0 | Free |
| pdfplumber | MIT | Free |
| Streamlit | Apache 2.0 | Free |
| tenacity | Apache 2.0 | Free |
| python-dotenv | BSD | Free |
| groq (client) | Apache 2.0 | Free |

No library in the stack has a paid component.

---

### 7. Development Hardware (Your Local Machine)

**Blueprint claim:** Not mentioned  
**Reality:** ⚠️ Real compute time, no monetary cost

Building the FAISS index for 8–12 PDFs on a local machine:
- Digital PDFs (pdfplumber): ~2–5 minutes
- Scanned PDFs (Tesseract at 300 DPI): **~10–30 minutes per 200-page document**
- Embedding generation: ~5–15 minutes for 5,000 chunks on CPU

This is not a monetary cost, but it is a real time cost. Every time you rebuild the index after a parameter change, you spend 30–60 minutes waiting. On a very old machine (Core i5, pre-2019), Tesseract on a heavy scanned document can take hours.

---

### 8. Stack Analysis Recommendations (ChromaDB, SQLite, Railway)

**My own stack analysis recommended Railway at $5/month.** Let's be honest about what's free and what's not among those recommendations:

| Recommendation | Cost | Notes |
|---------------|------|-------|
| ChromaDB (self-hosted, `PersistentClient`) | ✅ Free | Files committed to GitHub like FAISS |
| ChromaDB Cloud (managed) | ❌ $5 credits then paid | Don't use this path |
| SQLite | ✅ Free | Open source, stdlib |
| `streamlit-authenticator` | ✅ Free | MIT license |
| Railway (always-on) | ❌ **$5/month** | Not free — but solves the cold start problem |

**Railway is not free.** It was recommended as a "nice to have" for always-on demos. For a truly free deployment, you either accept HF Spaces cold starts or find another workaround (keep the Space alive with a cron ping service).

---

## Hidden Costs Summary

| Hidden Cost | Likelihood | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Groq rate limit during live demo | **Very high** | Demo looks broken | Retry logic (implemented), show typing animation |
| Groq free tier policy change | Medium | App breaks overnight | Add Gemini Flash fallback (also free) |
| HF Spaces cold start during recruiter visit | **Very high** | Recruiter closes tab | Pre-warm ping service (free) or Railway ($5) |
| GitHub LFS bandwidth exceeded | Low-medium (depends on traffic) | App goes down | Set LFS budget to $0, monitor usage |
| GitHub repo >1 GB (LFS storage) | Low for 8–12 PDFs, grows over time | Push blocked | Keep index small, LFS compression |
| Tesseract/Poppler missing on HF Spaces | **Certain without `packages.txt`** | Admin panel crashes | Create `packages.txt` (2 lines, identified in risk analysis) |

---

## The "Ping to Stay Alive" Trick (Free Cold Start Mitigation)

HF Spaces sleeps after ~15 minutes of inactivity. You can keep it awake for free using any of:

- **UptimeRobot** (free tier): pings your HF Spaces URL every 5 minutes — Space never sleeps during your demo period. Limited to 50 monitors, 5-minute interval on free tier.
- **Cron-job.org** (free): HTTP GET to your Space URL on a schedule.
- **GitHub Actions** (free): scheduled workflow that hits your URL.

**Catch:** HF Spaces free tier has a monthly compute budget. Keeping a Space awake 24/7 with pings may exceed this budget. HF's free compute is not unlimited — it's enough for a portfolio project that sleeps naturally, not for one that's pinged continuously.

---

## Honest Daily/Monthly Cost Model

### Scenario A: Solo Portfolio (Occasional Recruiter Visits)
| Component | Monthly cost |
|-----------|-------------|
| HF Spaces | ₹0 |
| Groq | ₹0 |
| GitHub | ₹0 |
| All libraries | ₹0 |
| **Total** | **₹0** |

✅ **This is achievable.** Cold starts are annoying but tolerable. Rate limits are unlikely to trigger from occasional visits.

---

### Scenario B: Active Demo During Interview Season
| Component | Monthly cost |
|-----------|-------------|
| HF Spaces (free, with cold starts) | ₹0 |
| Groq (free, rate limits possible) | ₹0 |
| GitHub | ₹0 |
| UptimeRobot (free tier, 5-min pings) | ₹0 |
| **Total** | **₹0** |

⚠️ **Achievable at ₹0 but fragile.** UptimeRobot pings may not prevent all cold starts. Groq rate limits may fire during concurrent interviews.

---

### Scenario C: Always-On, Reliable Demo
| Component | Monthly cost |
|-----------|-------------|
| Railway (always-on hosting) | **~₹420/month ($5)** |
| Groq | ₹0 |
| GitHub | ₹0 |
| **Total** | **~₹420/month** |

This is what the stack analysis recommended. Not free, but genuinely reliable.

---

### Scenario D: App Gets Shared Publicly (Unexpected Traffic)
| Component | Monthly cost |
|-----------|-------------|
| HF Spaces | ₹0 |
| Groq | **₹0 then throttled** (1,000 req/day limit hit) |
| GitHub LFS bandwidth | **₹0 → blocked or billed** |
| **Total** | **₹0 until it breaks** |

❌ **Not sustainable beyond portfolio scale.**

---

## Risk Register for Free Operation

| Risk | Probability | Severity | Blueprint's Response |
|------|------------|----------|---------------------|
| Groq changes free tier | Medium | **Critical — app unusable** | Not addressed |
| HF Spaces changes free sleep policy | Low | High | Not addressed |
| GitHub LFS limits hit | Low-Medium | High — app goes down | Not addressed |
| Groq RPM hit during demo | **High** | Medium — 10–30s lag | Retry logic (partial mitigation) |
| HF Spaces cold start during key demo | **Very High** | High — recruiter leaves | Only partially acknowledged |

---

## Final Verdict

# ⚠️ Mostly Free — With Serious Conditions

### What Is Genuinely Free
- All Python libraries: ✅ Free
- Embedding model (local): ✅ Free
- FAISS/ChromaDB (local files): ✅ Free
- SQLite: ✅ Free
- GitHub (within LFS limits): ✅ Free
- HF Spaces (with cold starts): ✅ Free

### What Is "Free But Will Hurt You"
- **Groq free tier:** 1,000 queries/day on LLaMA 3.3 70b. Fine for portfolio. Breaks under any real load. Retry logic helps the RPM problem but not the RPD limit.
- **HF Spaces cold start:** 48–78 seconds from click to first answer after idle. Recruiters will not wait. This is the #1 demo killer and it costs ₹0 to experience.
- **GitHub LFS bandwidth:** 10 GB/month free. Fine unless traffic picks up or cold starts accumulate.

### What Is Not Free
- **Always-on hosting** (Railway/HF Pro): $5–$9/month. The blueprint doesn't mention this trade-off exists.
- **Groq paid tier** (if free limits change): Pay-as-you-go, ~$0.59/1M tokens for LLaMA 3.3 70b

### The One Thing the Blueprint Gets Wrong
The cost table lists **"Total: ₹0"** as a fact, not a condition. It should read:

> **₹0/month under normal portfolio usage with cold-start latency accepted.**  
> **~₹420/month ($5) for a demo-ready, always-on deployment that won't embarrass you.**

The difference between those two is whether a recruiter clicking your link at 2pm on a Tuesday experiences a 60-second spinner or a working app. That is a real choice with a real cost.

---

## Recommended Free Setup (Maximise Quality at ₹0)

1. **Deploy on HF Spaces** (free hosting)
2. **Use Groq free tier** — add Gemini Flash as a documented fallback
3. **Set GitHub LFS budget to $0** — prevents surprise billing, causes visible failure instead
4. **Add UptimeRobot** (free, 5-min pings) — keeps the Space alive during business hours when you're actively job hunting. Pause it when not needed.
5. **Add a loading screen** in the Streamlit app that explains the cold start: "⏳ First load may take 30–60 seconds on the free tier. Subsequent queries are fast."  
   This manages recruiter expectations rather than letting them interpret the delay as a broken app.
6. **Document all limitations in your README** — recruiters who understand the trade-offs you made are more impressed than those who think you hid them.
