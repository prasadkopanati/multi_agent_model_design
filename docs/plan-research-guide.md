# Research Stage Guide

## Overview

The **research stage** is a dedicated pipeline step that runs between spec approval and planning. A focused Claude agent searches the web, fetches documentation, and gathers everything the executor needs before writing a single line of code — API shapes, auth flows, SDK signatures, rate limits, and qualified GitHub reference implementations.

This solves a core problem: the executor is highly capable at following instructions but has no access to live information. Without explicit context, the executor guesses. Guesses cause review failures. The research stage eliminates those guesses upfront.

---

## Design Principle

> **The executor is dumb about the world but smart about following instructions.**

Everything the executor needs to know that isn't already in the codebase must be provided explicitly. The research stage operationalizes this:

```
spec [approved] → research agent runs → user approves research.md → plan agent reads it → executor builds
```

The executor reads `.spiq/research.md` before touching a single file. The plan agent reads it before decomposing tasks. Neither needs to run its own web searches.

---

## Pipeline Position

```
brainstorm → spec [approval] → research [approval loop] → plan [approval] → build → test → review → finish
```

Research runs **after** spec approval (it knows exactly what to look up) and **before** planning (the planner uses it to estimate complexity and write precise acceptance criteria). No code is involved — research is purely informational.

---

## How the Approval Loop Works

At the end of the research stage the orchestrator shows:

```
📚 Research saved → .spiq/research.md
Approve research and continue to plan? [y/N/feedback text]
```

| Input | Effect |
|-------|--------|
| `y` | Approve and continue to plan |
| `n` or empty Enter | Re-run research with no extra guidance |
| Any other text | Inject that text as feedback into the next research run |

**Feedback injection** is the key feature. If the first run missed something — wrong API version, skipped an important library, not enough depth on auth — you can type exactly what was missing and the research agent will use that as explicit guidance on the next pass:

```
Approve research and continue to plan? [y/N/feedback text]
need more detail on the Stripe webhook signature verification flow and retry handling
```

The agent receives your text as `{{RESEARCH_FEEDBACK}}` and adjusts its topic selection and query depth accordingly. This loop repeats until you type `y`.

---

## What the Research Agent Does

### Step 1 — Service check

Verifies which API keys are configured: `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`, `GITHUB_TOKEN`. Notes unavailable services.

### Step 2 — Topic identification

Reads the approved spec and extracts 3–8 technical dependencies the executor will need:

- External APIs and SDKs — endpoint shapes, auth flows, request/response formats, rate limits
- Third-party libraries — constructor signatures, method names, return types
- Platform behaviours — webhooks, OAuth flows, pagination patterns
- Non-obvious file formats or protocols
- API key setup requirements (where to get keys, how to pass them)
- GitHub reference implementations

### Step 3 — Targeted queries

For each topic, uses the decision framework from `RESEARCH.md`:

```
Unknown topic / need URLs?           → Tavily search
Have a URL, need its content?        → Firecrawl scrape or crawl
JS-heavy / social / e-commerce?      → Apify actor
Need to find then read the page?     → Tavily → Firecrawl
```

Max 2 queries per topic. Results are summarized — full documentation pages are never pasted.

### Step 4 — GitHub quality filter

When a reference implementation would help, the agent searches for GitHub repos and checks each one against the GitHub REST API.

**Hard threshold: ≥ 100 stars AND ≥ 10 forks.** Repos below this are discarded without mention. This keeps the research clean — a 12-star repo from 2019 is noise, not signal.

```python
def check_repo(owner_repo):
    url = f"https://api.github.com/repos/{owner_repo}"
    # ... fetches stargazers_count, forks_count
    return stars >= 100 and forks >= 10
```

`GITHUB_TOKEN` is optional (60 unauthenticated requests/hour is enough for a research run). Set it in `.env` to raise the limit to 5000/hour.

### Step 5 — Save to `.spiq/research.md`

All findings are written in a structured format:

```markdown
# Research Context

> Gathered by research agent. Read this before writing any code.
> Services used: Tavily, Firecrawl. Queries run: 7.

---

## Stripe Webhook Signature Verification

**Source:** Tavily → "stripe webhook signature verification node.js" + Firecrawl → https://stripe.com/docs/webhooks
**Relevant to:** Task 3 (verify incoming webhook events)

**Key findings:**
- Stripe sends `Stripe-Signature` header with each event
- Must use raw request body (not parsed JSON) — use express.raw() middleware
- Verify using stripe.webhooks.constructEvent(rawBody, sig, secret)
- Webhook secret is found in Stripe Dashboard → Developers → Webhooks → endpoint secret

**Minimal working example:**
```js
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
});
```

**Reference:** https://stripe.com/docs/webhooks/signatures

---

## GitHub Reference Implementations

| Repository | Stars | Forks | Relevance |
|------------|-------|-------|-----------|
| [stripe-samples/accept-a-payment](https://github.com/stripe-samples/accept-a-payment) | 2.8k | 1.2k | Node.js webhook handling pattern |

---

## Research Summary

| Topic | Source | Status |
|-------|--------|--------|
| Stripe webhooks | Tavily + Firecrawl | complete |
| SendGrid email API | Firecrawl | complete |
| Redis pub/sub Node.js | Tavily | complete |
```

For any topic requiring more than ~500 words, a dedicated deep-dive file is written to `.spiq/research/<topic-slug>.md` with a link from `research.md`.

---

## How the Executor Benefits

The executor reads `research.md` immediately after `handoff.md` — before writing any code. The research gives it:

1. **Exact API shapes** — no guessing at endpoint paths, parameter names, or response structures
2. **Auth patterns** — the precise header format, token type, and where to source the key
3. **Known gotchas** — deprecated methods, version-specific breaking changes, rate limits
4. **Minimal working examples** — smallest valid snippet for each integration point
5. **Qualified reference implementations** — real-world code from high-quality repos to cross-check patterns against

The build prompt instructs the executor explicitly:

> Read `.spiq/research.md` immediately after the handoff. Use it as your primary reference — do not run web searches for information already documented there.

This means the executor spends its context budget on implementation, not discovery.

---

## Why a Separate Stage (Not Embedded in Plan)

The previous design embedded research inline as Step 0 of the plan prompt. This had two failure modes:

1. **Context competition** — the plan agent's context already contained spec, brainstorm output, and all planning steps. Research findings were frequently compressed or skipped when the model had to fit everything into one pass.
2. **Attention split** — the same model invocation was responsible for both "gather raw information" and "decompose tasks" — conflicting cognitive modes in a single window.

The dedicated stage gives research its own focused context window. The plan agent gets clean, pre-digested findings. The executor gets direct access to the artifact without parsing it out of the plan.

---

## Configuration

Add keys to `.env` in the agenticspiq installation directory:

```env
# Tavily: web search (https://app.tavily.com)
TAVILY_API_KEY=tvly-...

# Firecrawl: page fetch & crawl (https://firecrawl.dev)
FIRECRAWL_API_KEY=fc-...

# Apify: platform scraping (https://console.apify.com/account/integrations)
APIFY_TOKEN=apify_api_...

# GitHub API token — optional; raises rate limit from 60 to 5000 req/hr
# GITHUB_TOKEN=ghp_...
```

All keys are optional — if a key is missing, that service is skipped. At least one of Tavily, Firecrawl, or Apify should be configured for research to be effective.

The `mcpc` CLI must be installed for Apify:
```bash
npm install -g @apify/mcpc
```

---

## The Three Research Services

### Tavily — Web Search

Use when you don't know which URL contains the information, or need a synthesized answer across multiple sources.

- Web search with direct answer synthesis (`include_answer=True`)
- `search_depth="advanced"` for complex technical queries
- News search with date filtering (`topic="news", days=N`)
- URL content extraction (`client.extract(urls=[...])`)

**Best for:** API documentation discovery, library comparison, best practices, recent changelogs.

**SDK:** `pip install tavily-python` | **Key:** `TAVILY_API_KEY`

---

### Firecrawl — Fetch & Crawl

Use when you have a specific URL and need clean, structured content. Handles JavaScript rendering and anti-bot measures automatically.

- Single page → clean Markdown (`scrape_url`)
- Multi-page site crawl with page limit (`crawl_url`)
- Structured extraction via Pydantic schema (`formats=["extract"]`)

**Best for:** Official documentation pages, API reference pages, multi-page doc sites.

**SDK:** `pip install firecrawl-py` | **Key:** `FIRECRAWL_API_KEY`

---

### Apify — Specialized Platform Scraping

Use when Firecrawl is blocked, the target is a JavaScript-heavy platform, or you need a proven scraper for a known platform.

| Platform | Actor ID |
|----------|----------|
| Google Search | `apify/google-search-scraper` |
| Generic JS site | `apify/web-scraper` |
| Instagram | `apify/instagram-scraper` |
| TikTok | `clockworks/tiktok-scraper` |
| YouTube | `streamers/youtube-scraper` |
| Google Maps | `compass/crawler-google-places` |
| Amazon | `apify/amazon-scraper` |

**SDK:** `pip install apify-client` | **Key:** `APIFY_TOKEN`

---

## Files Changed

| File | Change |
|------|--------|
| `prompts/research.md` | New stage prompt — research agent instructions |
| `orchestrator/orchestrator.js` | Added `research` to `DEFAULT_AGENTS` and `PIPELINE`; added `promptResearchApproval()` loop; extended worktree copy for `research.md` and `research/` dir |
| `orchestrator/workspace-config.js` | Added `researchFile` and `researchDir` paths |
| `orchestrator/promptCompiler.js` | Added `research` to `BASE_SKILLS`; added `{{RESEARCH_FILE}}`, `{{RESEARCH_DIR}}`, `{{RESEARCH_FEEDBACK}}` substitutions |
| `prompts/plan.md` | Replaced Step 0 (inline research workflow) with "read research.md + fallback" instruction |
| `prompts/build.md` | Added "read research.md immediately after handoff" to context budget block |
| `prompts/skills/RESEARCH.md` | Added GitHub quality filter section; updated output target from `plan.md` inline to `.spiq/research.md` file |
| `.env.example` | Added `GITHUB_TOKEN` as optional variable |

---

## Fallback: Pipeline Resumed at Plan Stage

If the pipeline is resumed starting at the plan stage (research already ran in a prior session, or was skipped), the plan agent checks for `.spiq/research.md`. If the file is missing it falls back to running its own research using `RESEARCH.md` and saves findings to `.spiq/research.md` before proceeding to task decomposition.
