---
name: wip-checkpoint
description: Commit in-progress work after every completed task with structured context so a fresh agent can resume without losing ground. Use during the build and test stages to create resumable save points.
---

# WIP Checkpoint Commits

## Overview

Commits are save points. An agent working on a multi-step build should treat each completed task as a commit, not an in-memory accumulation. If the agent crashes, the context limit is hit, or the retry loop fires, the next agent reads the WIP commits and resumes from the last save point — not from scratch.

**The rule:** Never hold more than one completed task un-committed. After every task: commit. After every failed fix attempt: commit.

---

## Checkpoint Discipline

### After every completed task

Stage all changes and commit with:

```
WIP(build): task-N complete — <task title from plan>
```

Commit body (required):

```
[gstack-context]
completed: [task-1, task-2, task-N]
remaining: [task-N+1, task-N+2, ...]
failed_approaches: []
notes: <any decisions made that are not obvious from the code>
```

The `completed` list grows with each checkpoint. The `remaining` list shrinks. Together they give a fresh agent its orientation without reading every file.

### After every failed fix attempt (before retrying)

Commit the current broken state with:

```
WIP(fix): attempt-N — <one-line description of what was tried>
```

Commit body:

```
[gstack-context]
completed: [<tasks finished before this failure>]
remaining: [<tasks not yet started>]
failed_approaches:
  - attempt-1: <what was tried> — <what happened>
  - attempt-2: <what was tried> — <what happened>
notes: <any relevant observations about the failure>
```

Append each new attempt to `failed_approaches`. This field is the institutional memory of the retry loop — it prevents the next attempt from repeating an already-tried approach.

---

## On Retry

When the orchestrator invokes failure analysis and the executor re-enters the build stage, the executor must:

1. Run `git log --oneline HEAD~10..HEAD` to find the most recent WIP commit
2. Read the `[gstack-context]` body to extract `completed`, `remaining`, and `failed_approaches`
3. Resume from the first task in `remaining` — do not re-implement anything in `completed`
4. Do not repeat any approach listed in `failed_approaches`

---

## On Completion

When the build stage finishes successfully, the final commit squashes all WIP prefixes into clean history:

```bash
# Reword all WIP commits in this pipeline run into conventional commits
# Each "WIP(build): task-N complete — X" becomes "feat(<scope>): X"
# Each "WIP(fix): attempt-N — X" that was superseded is dropped
```

The `BUILD_HANDOFF_SUMMARY.md` skill produces the terminal summary — WIP checkpoint context feeds into it rather than competing with it.

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Implementing 3 tasks before committing | A crash or context limit loses all 3 tasks; retry restarts from scratch |
| Committing without `[gstack-context]` body | Fresh agent cannot reconstruct what was done; reads every file instead |
| Re-reading `failed_approaches` as suggestions | They are eliminated approaches — do not retry them |
| Squashing WIP commits before the stage completes | Removes the save points mid-session; defeats the purpose |

---

## Verification

- [ ] Every completed task has a WIP commit before the next task starts
- [ ] Every failed fix attempt has a WIP commit with an updated `failed_approaches` entry
- [ ] `[gstack-context]` body is present on every WIP commit
- [ ] `remaining` list matches the un-started tasks in the plan
- [ ] On retry, the executor resumes from `remaining[0]`, not from the beginning
