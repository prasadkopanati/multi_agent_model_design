---
name: Research
description: Use Tavily, Firecrawl, and Apify to gather web context for the executor during planning. Covers web search, page fetch, site crawl, and specialized platform scraping. Run before writing any task plan when the feature involves APIs, libraries, platforms, or real-world data the executor cannot be expected to know.
---

# Research — Gather Context for the Executor

> The executor is skilled at following instructions but has no access to live web information. Your job as planner is to close that knowledge gap. Every piece of context you gather here saves the executor from guessing.

---

## When to Research

Research is **mandatory** when the feature involves any of:

- An external API or SDK (endpoints, auth flows, rate limits, response shapes)
- A specific library or framework not already in the codebase
- A third-party platform (social media, e-commerce, maps, etc.)
- UI/UX patterns or design references the executor must replicate
- File formats, protocols, or standards with non-obvious implementation details
- Current pricing, availability, or configuration of cloud services

Research is **optional but recommended** when:
- The spec mentions a technology you haven't seen in this codebase before
- Acceptance criteria reference behaviour from another product or service

Research is **not needed** when:
- The task is pure refactoring or restructuring of existing code
- All required information is already in the spec or codebase

---

## Decision Framework

```
Need to find relevant URLs / understand a topic?   → Tavily
Have a specific URL, need its content?             → Firecrawl
JS-heavy site / social / e-commerce / maps?        → Apify
Need to search then read the found pages?          → Tavily (find) → Firecrawl (read)
Structured data with known schema from a URL?      → Firecrawl extract
Platform-specific scraping (Instagram, Amazon…)?   → Apify actor
```

---

## Prerequisite Check

Before researching, verify which keys are available:

```bash
python3 << 'EOF'
import os
keys = {
    "Tavily":    os.environ.get("TAVILY_API_KEY"),
    "Firecrawl": os.environ.get("FIRECRAWL_API_KEY"),
    "Apify":     os.environ.get("APIFY_TOKEN"),
}
for name, val in keys.items():
    status = "✓ available" if val else "✗ missing — skip this service"
    print(f"  {name}: {status}")
EOF
```

If a key is missing, skip that service and use an available one. Note in RESEARCH CONTEXT which services were unavailable.

---

## 1. Tavily — Web Search

Use when you need to find information without knowing the exact URL.

```bash
python3 << 'EOF'
import os, json
from tavily import TavilyClient

client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

# Basic search — use for most queries
results = client.search(
    query="YOUR QUERY HERE",
    search_depth="advanced",   # use "basic" for simple lookups
    max_results=5,
    include_answer=True,
)

print("=== ANSWER ===")
print(results.get("answer", "(no direct answer)"))
print("\n=== SOURCES ===")
for r in results["results"]:
    print(f"\n[{r['title']}]")
    print(f"URL: {r['url']}")
    print(r["content"][:600])
EOF
```

**Fetch full page content from known URLs via Tavily:**

```bash
python3 << 'EOF'
import os
from tavily import TavilyClient

client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
pages = client.extract(urls=["https://example.com/docs/api"])
for page in pages.get("results", []):
    print(f"URL: {page['url']}")
    print(page["raw_content"][:2000])
EOF
```

**News search (for recent releases, changelogs, announcements):**

```bash
python3 << 'EOF'
import os
from tavily import TavilyClient

client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
results = client.search(query="YOUR TOPIC latest", topic="news", days=30)
for r in results["results"]:
    print(f"[{r['title']}] {r['url']}")
    print(r["content"][:400])
    print()
EOF
```

---

## 2. Firecrawl — Fetch & Crawl

Use when you have a specific URL and need clean, readable content (handles JavaScript, anti-bot measures).

**Single page — documentation, API reference, product page:**

```bash
python3 << 'EOF'
import os
from firecrawl.v1 import V1FirecrawlApp

app = V1FirecrawlApp(api_key=os.environ["FIRECRAWL_API_KEY"])
result = app.scrape_url("https://example.com/docs", formats=["markdown"])
print(result.markdown[:3000])
EOF
```

**Crawl multiple pages — when docs span several pages:**

```bash
python3 << 'EOF'
import os
from firecrawl.v1 import V1FirecrawlApp

app = V1FirecrawlApp(api_key=os.environ["FIRECRAWL_API_KEY"])
crawl = app.crawl_url(
    "https://example.com/docs",
    limit=10,
    scrape_options={"formats": ["markdown"]},
)
for page in crawl.data:
    print(f"\n=== {page.url} ===")
    print((page.markdown or "")[:1500])
EOF
```

**Structured extraction — pull specific fields from a page:**

```bash
python3 << 'EOF'
import os
from pydantic import BaseModel
from firecrawl.v1 import V1FirecrawlApp

class PricingInfo(BaseModel):
    plan_name: str
    price: str
    features: list[str]

app = V1FirecrawlApp(api_key=os.environ["FIRECRAWL_API_KEY"])
result = app.scrape_url(
    "https://example.com/pricing",
    formats=["extract"],
    extract={"schema": PricingInfo.model_json_schema()},
)
print(result.extract)
EOF
```

---

## 3. Apify — Specialized Platform Scraping

Use for JS-heavy sites, social media, e-commerce, maps, and any platform where Firecrawl is blocked or insufficient.

**Quick scrape via `mcpc` CLI (recommended — no Python needed):**

```bash
# Google Search
export APIFY_TOKEN="${APIFY_TOKEN:-$(python3 -c "import os; print(os.environ['APIFY_TOKEN'])")}"
mcpc --json mcp.apify.com \
  --header "Authorization: Bearer $APIFY_TOKEN" \
  tools-call run-actor \
  actor:="apify/google-search-scraper" \
  input:='{"queries":["YOUR SEARCH QUERY"],"maxPagesPerQuery":1,"resultsPerPage":10}' \
  | python3 -c "import json,sys; data=json.load(sys.stdin); [print(r.get('title',''), r.get('url','')) for r in data.get('items',[])]"
```

**Via Python SDK (for programmatic control):**

```bash
python3 << 'EOF'
import os
from apify_client import ApifyClient

client = ApifyClient(token=os.environ["APIFY_TOKEN"])

run = client.actor("apify/google-search-scraper").call(run_input={
    "queries": ["YOUR QUERY"],
    "maxPagesPerQuery": 1,
    "resultsPerPage": 10,
})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item.get("title"), item.get("url"))
    print(item.get("description", "")[:400])
    print()
EOF
```

**Common Actor IDs by use case:**

| Need | Actor ID |
|------|----------|
| Google Search results | `apify/google-search-scraper` |
| Generic JS-rendered page | `apify/web-scraper` |
| Fast static site scrape | `apify/cheerio-scraper` |
| Instagram profiles/posts | `apify/instagram-scraper` |
| TikTok content | `clockworks/tiktok-scraper` |
| YouTube channel/videos | `streamers/youtube-scraper` |
| Google Maps businesses | `compass/crawler-google-places` |
| Amazon products | `apify/amazon-scraper` |
| Contact info from URLs | `vdrmota/contact-info-scraper` |
| Google Trends | `apify/google-trends-scraper` |

**Find an actor when none of the above fit:**

```bash
export APIFY_TOKEN="${APIFY_TOKEN:-$(python3 -c "import os; print(os.environ['APIFY_TOKEN'])")}"
mcpc --json mcp.apify.com \
  --header "Authorization: Bearer $APIFY_TOKEN" \
  tools-call search-actors \
  keywords:="YOUR KEYWORDS" limit:=5 offset:=0 \
  | python3 -c "import json,sys; [print(a.get('id'), '-', a.get('description','')[:80]) for a in json.load(sys.stdin).get('items',[])]"
```

---

## 4. GitHub Repository Search (Quality Filter)

When a reference implementation on GitHub would help the executor, search for repos using
Tavily (query: `site:github.com <topic>`). Then verify each found repo against the GitHub
REST API.

**Hard quality threshold: ≥ 100 stars AND ≥ 10 forks. Discard any repo below this.**

```bash
python3 << 'EOF'
import os, json, urllib.request

def check_repo(owner_repo):
    url = f"https://api.github.com/repos/{owner_repo}"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "spiq-research"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            stars = data.get("stargazers_count", 0)
            forks = data.get("forks_count", 0)
            passed = stars >= 100 and forks >= 10
            print(f"{'PASS' if passed else 'SKIP'}  {owner_repo}: {stars} stars, {forks} forks")
            return passed, data
    except Exception as e:
        print(f"  Error checking {owner_repo}: {e}")
        return False, {}

repos = ["owner/repo"]  # populate from Tavily search results
for repo in repos:
    passed, data = check_repo(repo)
    if passed:
        print(f"  Include: {data.get('html_url')} -- {data.get('description','')}")
EOF
```

`GITHUB_TOKEN` is optional — the API works unauthenticated at 60 req/hour, which is
sufficient for research. Set it in `.env` to raise the limit to 5000 req/hour if needed.

---

## Research Discipline

Run at most **5 targeted queries** total. More is waste — the executor gets overwhelmed by noise.

Good queries are specific:
- ✓ `"Stripe webhook signature verification Node.js"`
- ✓ `"Playwright screenshot full page headless 2024"`
- ✗ `"how to build a web app"` — too broad

For each query, capture only what the executor needs:
- API endpoints, request/response shapes
- Auth patterns (headers, tokens, OAuth flows)
- Required parameters and their valid values
- Known gotchas, rate limits, deprecated patterns
- Minimal working code examples

Do NOT paste entire documentation pages into the plan. Summarize and extract.

---

## Research Output Format

Write findings to **`.spiq/research.md`** using `write_file`. This is the primary artifact
read by both the plan agent and the executor agent.

For any topic requiring more than ~500 words to cover adequately, write a dedicated file
to `.spiq/research/<topic-slug>.md` and include a one-line summary plus link in `research.md`.

```markdown
# Research Context

_Gathered by the research agent. Read this before writing any code._
_Services used: Tavily · Firecrawl · Apify_ (or list which ones were available)

---

### [Topic 1 — e.g., Stripe Webhook Auth]

**Source:** Tavily search — `"stripe webhook signature verification"`
**Relevance:** Required for Task 3 (verify incoming webhook events)

**Key findings:**
- Stripe sends `Stripe-Signature` header; verify using `stripe.webhooks.constructEvent()`
- Secret is set in Stripe dashboard → Developers → Webhooks → endpoint secret
- Must use raw request body (not parsed JSON) for signature check

**Minimal working example:**
```js
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
```

**Reference URL:** https://stripe.com/docs/webhooks/signatures

---

### [Topic 2 — e.g., Library X API Shape]

**Source:** Firecrawl — `https://library-x.dev/docs/api`
**Relevance:** Required for Task 1 (initialize client) and Task 5 (parse response)

**Key findings:**
- ...
```

Keep each entry focused on the tasks that need it. If a finding applies to multiple tasks, say so explicitly.
