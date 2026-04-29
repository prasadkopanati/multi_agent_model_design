# Plan Stage Research Guide

## Overview

The **plan stage** now includes a mandatory research step (Step 0) that runs before any task decomposition. The planning agent — Claude Code — uses Tavily, Firecrawl, and Apify to gather live web context and embed it directly into `plan.md` as a `RESEARCH CONTEXT` section.

This solves a core problem: the executor is highly capable at following instructions, but has no access to live information — API docs, platform quirks, library patterns, rate limits, or real-world data. Without explicit context, the executor guesses. Guesses cause review failures. The plan agent's job is to eliminate those guesses upfront.

---

## Design Principle

> **The executor is dumb about the world but smart about following instructions.**

Everything the executor needs to know that isn't already in the codebase must be provided explicitly in the plan. The research step operationalizes this:

```
spec → [plan agent reads spec] → [plan agent runs research] → [research embedded in plan.md] → executor builds
```

The executor reads `RESEARCH CONTEXT` before touching a single file.

---

## How It Works

### Step 0 in `prompts/plan.md`

The plan prompt now opens with Step 0, which instructs the planning agent to:

1. Read `.spiq/skills/RESEARCH.md` for the decision framework and code snippets
2. Identify knowledge gaps in the spec — things the executor cannot be expected to know
3. Run targeted queries using Tavily, Firecrawl, or Apify
4. Write a `## RESEARCH CONTEXT` section at the top of `plan.md`

If no external knowledge is needed (pure refactoring, existing patterns only), the planner writes a one-liner noting research was skipped.

### The `RESEARCH.md` skill

**File:** `prompts/skills/RESEARCH.md`

This skill is loaded for every plan stage run (registered in `promptCompiler.js`). It provides:

- **When to research** — trigger conditions and skip conditions
- **Decision framework** — which tool to use for which type of query
- **Runnable code snippets** — copy-paste Python for each service
- **Research discipline** — max 5 queries, specific not broad
- **Output format** — the `RESEARCH CONTEXT` template

The planning agent reads this skill file via its file tool during Step 0.

---

## The Three Research Services

### Tavily — Web Search

**Use when:** You don't know which URL contains the information, or you need a synthesized answer across multiple sources.

**Capabilities:**
- Web search with direct answer synthesis (`include_answer=True`)
- `search_depth="advanced"` for complex technical queries
- News search with date filtering (`topic="news", days=N`)
- URL content extraction (`client.extract(urls=[...])`)

**Best for:** API documentation discovery, library comparison, best practices, recent changelogs, conceptual understanding.

**Python SDK:** `pip install tavily-python`
**Key env var:** `TAVILY_API_KEY`

---

### Firecrawl — Fetch & Crawl

**Use when:** You have a specific URL and need clean, structured content. Handles JavaScript rendering and anti-bot measures automatically.

**Capabilities:**
- Single page → clean Markdown (`scrape_url`)
- Multi-page site crawl with page limit (`crawl_url`)
- Structured extraction via Pydantic schema (`formats=["extract"]`)

**Best for:** Official documentation pages, API reference pages, product pages, multi-page doc sites.

**Python SDK:** `pip install firecrawl-py`
**Key env var:** `FIRECRAWL_API_KEY`

---

### Apify — Specialized Platform Scraping

**Use when:** Firecrawl is blocked, the target is a JavaScript-heavy platform (social media, e-commerce, maps), or you need a proven scraper for a known platform.

**Capabilities:**
- 55+ pre-built Actors covering Instagram, Facebook, TikTok, YouTube, Google Maps, Google Search, Amazon, and more
- Actor discovery via `mcpc` CLI search
- CSV/JSON output, programmatic control via Python SDK
- Chainable multi-Actor workflows (e.g., find businesses → enrich with contact info)

**Common Actors:**

| Platform | Actor ID |
|----------|----------|
| Google Search | `apify/google-search-scraper` |
| Instagram | `apify/instagram-scraper` |
| TikTok | `clockworks/tiktok-scraper` |
| YouTube | `streamers/youtube-scraper` |
| Google Maps | `compass/crawler-google-places` |
| Amazon | `apify/amazon-scraper` |
| Generic JS site | `apify/web-scraper` |
| Contact info from URLs | `vdrmota/contact-info-scraper` |

**Invocation:** via `mcpc` CLI or `apify_client` Python SDK
**Key env var:** `APIFY_TOKEN`

---

## Decision Guide

```
Searching for information (no known URL)?        → Tavily
Have a known URL, need its content?              → Firecrawl
Need recent news / announcements?                → Tavily (topic="news")
Need structured data from a known page schema?   → Firecrawl (extract)
Social media / e-commerce / maps data?           → Apify
Firecrawl blocked or insufficient?               → Apify
Search then read found pages?                    → Tavily → Firecrawl
```

---

## Configuration

Add API keys to `.env` in the project root:

```env
# Tavily: web search (https://app.tavily.com)
TAVILY_API_KEY=tvly-...

# Firecrawl: page fetch & crawl (https://firecrawl.dev)
FIRECRAWL_API_KEY=fc-...

# Apify: platform scraping (https://console.apify.com/account/integrations)
APIFY_TOKEN=apify_api_...
```

Keys are optional — if a key is missing, the planning agent skips that service and uses whichever ones are available. At least one service should be configured for research to be effective.

The `mcpc` CLI must be installed for Apify:
```bash
npm install -g @apify/mcpc
```

---

## RESEARCH CONTEXT Format

The planner embeds research as the first section of `plan.md`, before the PLAN QUALITY GATE RESULT block:

```markdown
## RESEARCH CONTEXT

_Gathered by the plan agent. Read this section before writing any code._
_Services used: Tavily · Firecrawl_

---

### Stripe Webhook Signature Verification

**Source:** Tavily search — `"stripe webhook signature verification nodejs"`
**Relevance:** Required for Task 3 (verify incoming webhook events)

**Key findings:**
- Stripe sends a `Stripe-Signature` header with each webhook
- Must use raw request body (not parsed JSON) — use `express.raw()` middleware
- Verify using `stripe.webhooks.constructEvent(rawBody, sig, secret)`
- Webhook secret is found in Stripe Dashboard → Developers → Webhooks

**Minimal working example:**
```js
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  // handle event...
});
```

**Reference:** https://stripe.com/docs/webhooks/signatures

---

### SendGrid Transactional Email API

**Source:** Firecrawl — https://docs.sendgrid.com/api-reference/mail-send/mail-send
**Relevance:** Required for Task 5 (send order confirmation email)

**Key findings:**
- POST to `https://api.sendgrid.com/v3/mail/send`
- Auth: `Authorization: Bearer SENDGRID_API_KEY`
- Required fields: `personalizations`, `from`, `subject`, `content`
- Rate limit: 100 requests/second on free tier
```

---

## Research Discipline

The planning agent is instructed to run at most **5 targeted queries** total. This constraint exists because:

1. **Executor overload** — a plan flooded with 20 research entries is harder to follow than 3 precise ones
2. **Token cost** — plan stage runs the controller (Claude), not a cheap model
3. **Signal-to-noise** — broad queries return generic information; specific queries return actionable facts

Queries must be specific:
- ✓ `"OpenAI function calling streaming Node.js 2024"`
- ✓ `"Playwright intercept network request modify response"`
- ✗ `"how to build a chatbot"` — too broad, useless to executor

For each query, capture only:
- Exact API endpoints and request/response shapes
- Auth patterns and required headers
- Required vs optional parameters
- Known gotchas, breaking changes, deprecated patterns
- Minimal working code examples

Do **not** paste entire documentation pages. Summarize and extract.

---

## Files Changed by This Feature

| File | Change |
|------|--------|
| `prompts/skills/RESEARCH.md` | New skill — full decision framework, runnable code snippets for all three services, output format |
| `prompts/plan.md` | Added Step 0 (Research) before Step 1; instructs planner to read RESEARCH.md and embed findings |
| `orchestrator/promptCompiler.js` | Added `RESEARCH.md` to `plan` BASE_SKILLS so it appears in the compiled prompt's skill index |
| `.env` | Added `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN` with comments |
| `CLAUDE.md` | Added the three new env vars to the Model Configuration table |

---

## Future Improvements

### Research output injected as context variable

Currently, the RESEARCH CONTEXT lives inside `plan.md` as plain text. The build and test stages receive `{{PLAN}}` which embeds the full plan, so the research is technically available — but not directly addressable. A dedicated `{{RESEARCH}}` context variable (populated from a separate `research.md` artifact) would let build and fix stages reference it without parsing the full plan. This would require a `researchFile` entry in `workspace-config.js` and a new `context.research` injection in the orchestrator.

### Research quality gate

The plan quality gate (`PLAN_QUALITY_GATE.md`) currently validates task structure but not research completeness. A sixth gate — "Research Coverage" — would check that every task referencing an external API or library has a corresponding RESEARCH CONTEXT entry. This closes the gap where a planner skips research for a task that clearly needs it.

### Caching repeated queries across runs

If the same feature is planned multiple times (e.g., after a spec rejection and re-plan), the same Tavily/Firecrawl/Apify queries run again. A simple file-based cache keyed by query hash in `.spiq/artifacts/research-cache/` would avoid redundant API calls and speed up re-planning.

### Research stage as a standalone pipeline step

Currently research is embedded in the plan stage. As feature complexity grows, a dedicated `research` stage before `plan` would allow the controller to focus entirely on information gathering (potentially running multiple parallel queries) before context-switching to task decomposition. This would map cleanly to the `PIPELINE` array and enable its own retry/failure handling.

### Apify multi-actor workflow support

The current `RESEARCH.md` skill supports single-actor Apify runs. For complex research tasks (e.g., find businesses on Google Maps → enrich each with contact info → cross-reference with TripAdvisor reviews), a workflow that chains two or three actors would produce richer output. The `apify-market-research` and `apify-competitor-intelligence` skill files in the Apify agent skills repo define these multi-actor workflows and could be referenced directly.

### Automatic library installation check

The Python snippets in `RESEARCH.md` require `tavily-python`, `firecrawl-py`, and `apify-client` to be installed. If any are missing, the planning agent gets a confusing `ModuleNotFoundError`. Adding a pre-research check that runs `pip install --quiet tavily-python firecrawl-py apify-client` (or checks and only installs missing packages) would make research reliable without requiring manual environment setup.
