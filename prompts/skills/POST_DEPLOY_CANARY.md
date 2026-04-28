---
name: post-deploy-canary
description: After a merge delivery, poll CI status, run a health check, and run a smoke test to verify production is healthy before declaring the pipeline complete. Applies only when FINISH_ACTION=merge.
---

# Post-Deploy Canary

## Overview

Ship means deployed, not just merged. The delivery is not complete until production is verified. In an automated pipeline, nobody watches the deploy — unless an automated check is in place. The canary converts `FINISH_ACTION=merge` from "the agent merged and hoped for the best" to "the agent merged, waited for CI, verified production is healthy, then reported complete."

**The rule:** After a merge, do not emit `Pipeline complete` until the canary passes.

---

## Applicability

The canary is **conditional on `FINISH_ACTION`**:

| `FINISH_ACTION` | Canary | Reason |
|---|---|---|
| `merge` | **Run** — mandatory | Code is now in production; verify it's healthy |
| `pr` (default) | **Skip** — note PR URL | PR is not merged; deployment has not happened |
| `keep` | **Skip** | Branch is staged, not deployed |
| `discard` | **Skip** | Branch is deleted, not deployed |

For `pr`, add a note to the delivery summary:

```
POST-DEPLOY NOTE: After the PR is merged and CI deploys, run a manual canary:
  node agent-cli/agent-cli.js --agent gemini --stage canary --workspace <path>
```

---

## Canary Steps (for `FINISH_ACTION=merge`)

### Step 1 — Wait for CI

After the merge command succeeds, poll the CI status:

```bash
gh run list --branch main --limit 5 --json status,conclusion,name
```

Poll every 30 seconds. Timeout: `CANARY_TIMEOUT` env var (default: 10 minutes).

```
CI POLL

  Run:        [workflow name]
  Status:     [queued | in_progress | completed]
  Conclusion: [success | failure | cancelled | timed_out]
  Elapsed:    [N seconds]
```

If CI fails: capture as canary failure and exit non-zero. Do not proceed to health check.
If CI times out: capture as canary failure with `ci_status: "timeout"` and exit non-zero.

### Step 2 — Health check

If `HEALTH_URL` is set in `.env`, hit it:

```bash
curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL"
```

Expected: `200`. Anything else is a health check failure.

If `HEALTH_URL` is not set, detect the project type from the spec and apply a reasonable default:
- Node.js service: `http://localhost:3000/health`
- Python Flask/FastAPI: `http://localhost:8000/health`
- Web app (static): check that the primary URL from the spec returns 200
- No web server: skip health check; log "no HEALTH_URL configured"

```
HEALTH CHECK

  URL:    [url checked]
  Status: [200 OK | <error code> — <detail>]
```

### Step 3 — Smoke verification (web projects)

For any project with HTML, CSS, or JavaScript output:

Using Playwright, navigate to the root URL and verify:
1. Page loads without a browser-level error (network error, certificate error)
2. The primary UI element described in the spec is visible in the DOM
3. Zero console errors on page load

```
SMOKE CHECK

  URL:            [url]
  Page loaded:    [yes | no — <error>]
  Primary element present: [yes | no — <what was missing>]
  Console errors: [0 | N — <list errors>]
  Status:         [PASS | FAIL]
```

For non-web projects, skip this step and log "no browser smoke check applicable."

### Step 4 — Record outcome

Write to `.spiq/artifacts/output/canary.json`:

```json
{
  "status": "PASS",
  "ci_status": "passed",
  "health_check": "200 OK",
  "smoke_check": "PASS",
  "verified_at": "<ISO timestamp>",
  "production_url": "<url>"
}
```

On failure, set `"status": "FAIL"` and populate the failing field with the error detail.

### Step 5 — On FAIL

Capture the canary failure as a failure record:

```
.spiq/artifacts/failures/canary-<timestamp>.json
```

with the content:

```json
{
  "stage": "canary",
  "error": "<what failed and why>",
  "canary_result": { <the canary.json content> }
}
```

Exit non-zero. The `Pipeline complete` message must NOT be emitted on a canary failure. Instead:

```
⚠️  CANARY FAILED: [what failed]
   Delivery action: merge succeeded — code is in main
   Production state: UNHEALTHY — [description]
   Failure record: .spiq/artifacts/failures/canary-<timestamp>.json
   Action required: investigate production; revert if necessary
```

---

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `HEALTH_URL` | (none) | Production health check endpoint |
| `CANARY_TIMEOUT` | `600` (10 min) | Seconds to wait for CI before timing out |

Both vars are read from `.env` in the workspace root.

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Emitting "Pipeline complete" before CI finishes | CI may be failing while the pipeline reports success |
| Skipping the canary when CI is slow | A slow CI run is not a reason to skip verification — it is a reason to set a longer timeout |
| Treating health check 200 as a full verification | A 200 response means the process is running, not that the feature works |
| Running canary for `pr` deliveries | The code has not been merged; there is nothing in production to verify |

---

## Verification

- [ ] `FINISH_ACTION` checked before running any canary step
- [ ] CI polled until pass, fail, or timeout — not skipped
- [ ] Health check run (or skipped with documented reason)
- [ ] Smoke verification run for web projects (or skipped with documented reason)
- [ ] `canary.json` written to `.spiq/artifacts/output/`
- [ ] On failure: failure record written and pipeline exits non-zero
- [ ] `Pipeline complete` only emitted after canary PASS
