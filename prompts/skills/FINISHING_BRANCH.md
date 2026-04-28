---
name: finishing-a-development-branch
description: Complete the development lifecycle after a review PASS. Use at the finish stage to run a final verification, produce a delivery summary, execute the chosen delivery action (PR, merge, or keep), and clean up the workspace.
---

# Finishing a Development Branch

## Overview

A review PASS is not the end of the pipeline — it is the gate before delivery. This skill covers the final mile: confirming the build is stable, deciding how to deliver the work, executing that delivery, and leaving the workspace in a clean state.

**The rule:** Never leave the workspace in a partially-finished state. Every pipeline run ends with a deliberate disposition of the work: delivered, staged for review, or explicitly kept for further work.

## When to Use

- In the `finish` stage, triggered after a `Verdict: PASS` from the review stage
- When a development branch is ready to deliver

**When NOT to use:** If the review verdict is FAIL, the pipeline does not advance to `finish`. Address review findings first (see `receiving-code-review`).

## The Finish Workflow

### Step 1: Final Verification

Before any delivery action, confirm the codebase is in a clean, deliverable state.

```bash
# Confirm test suite is green
npm test

# Confirm build is clean
npm run build

# Confirm no uncommitted changes
git status
```

Expected outcome:

```
FINAL VERIFICATION:
  Tests: [N] passed, 0 failed
  Build: clean
  Working tree: clean (all changes committed)
```

If tests fail or the build is broken at this point: stop. The work is not deliverable. Return to the build or test stage.

If there are uncommitted changes: commit them before proceeding. A delivery with uncommitted changes in the workspace is a partial delivery.

### Step 2: Produce the Delivery Summary

Read the pipeline artifacts (spec, plan, review verdict, commit history) and produce a short delivery summary. This becomes the PR description or merge commit message.

```
DELIVERY SUMMARY

## What Was Built

[3-5 bullet points summarizing the features implemented, derived from spec + commits]

## Test Coverage

[Number of tests added; what behaviors they cover; any known gaps]

## Review Findings Addressed

Verdict: PASS
Critical: 0 | Important: 0 | Suggestions: [N applied]
[List any Important findings that were addressed during the build cycle]

## Spec Compliance

[List spec requirements and whether they were implemented, deferred, or changed]
```

### Step 3: Determine the Delivery Action

Check the `FINISH_ACTION` environment variable. If not set, default to `pr`.

| `FINISH_ACTION` | Action |
|---|---|
| `pr` (default) | Create a pull request against the main branch |
| `merge` | Merge the branch directly into the main branch |
| `keep` | Leave the branch as-is; no merge or PR |
| `discard` | Delete the branch; the work is abandoned |

### Step 4: Execute the Delivery Action

**No-Remote Guard (check before any push):**

Before executing any push, verify a remote is configured:

```bash
git remote get-url origin 2>/dev/null
```

If this returns empty (no remote configured):

- For `keep`: Do not attempt a push. Print:
  `Branch preserved locally (no remote configured). Set GIT_REMOTE_URL in .env and re-run to push.`
  Write the delivery summary and exit normally — this is not a failure.
- For `pr` or `merge`: Stop. Print:
  `Delivery blocked: no remote configured. Set GIT_REMOTE_URL in .env before running agenticspiq, or push manually.`
  Do NOT attempt to create a PR or merge.

**`pr` — Create a pull request**

```bash
# Push branch to remote
git push -u origin $(git branch --show-current)

# Create the PR with the delivery summary as the body
gh pr create \
  --title "[feature title from spec]" \
  --body "[delivery summary from Step 2]" \
  --base main
```

On success, print the PR URL.

**`merge` — Merge into main**

```bash
# Ensure main is up to date
git fetch origin main

# Merge the feature branch into main
git checkout main
git merge --no-ff $(git branch --show-current) -m "[delivery summary title]"
git push origin main
```

Use `--no-ff` to preserve the merge commit and the feature branch history.

**`keep` — Preserve the branch**

```bash
# Push the branch to remote so it is not lost when the local workspace is cleaned up
git push -u origin $(git branch --show-current)
```

Print the branch name and remote URL. No merge or PR is created.

**`discard` — Delete the branch**

```bash
# Confirm with a summary of what will be lost before deleting
echo "Discarding branch: $(git branch --show-current)"
echo "Commits: $(git log main..HEAD --oneline | wc -l)"
git log main..HEAD --oneline

# Delete local and remote
git checkout main
git branch -D [feature-branch]
git push origin --delete [feature-branch]
```

Always print what is being discarded before executing.

### Step 5: Clean Up the Workspace

After delivery:

```bash
# Remove .spiq/ build artifacts (keep the workspace clean for the next run)
# Note: do NOT remove .spiq/tasks.json — it holds pipeline state for resume

# If using git worktrees, remove the feature worktree
git worktree remove [worktree-path] --force

# Return to main branch if on a feature branch
git checkout main
```

Print a completion message with the outcome:

```
Pipeline complete.
Action: PR created → https://github.com/org/repo/pull/42
Branch: feature/user-auth
Tests: 24 passed
Review: PASS (0 critical, 0 important)
```

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Skipping the final test run because "tests passed in the test stage" | Time passed between test stage and delivery; changes may have been made |
| Creating a PR with uncommitted changes in the working tree | The PR does not represent the actual final state |
| Using `merge` when the team expects PRs | Bypasses the team's review process |
| Using `discard` without printing what is being deleted | Unrecoverable loss without confirmation |
| Leaving the workspace in a mid-delivery state | The next pipeline run starts from a dirty workspace |

## Verification

Before declaring the finish stage complete:

- [ ] Final test run executed and passed (0 failures)
- [ ] Build is clean
- [ ] All changes are committed
- [ ] Delivery summary is written (will become PR description or merge message)
- [ ] Delivery action executed successfully
- [ ] Branch pushed to remote (for `pr`, `keep`; or deleted for `discard`)
- [ ] Workspace is clean after delivery
- [ ] Completion message printed with outcome and PR/branch URL
