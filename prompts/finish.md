---
description: Complete the development lifecycle — final verification, delivery summary, execute delivery action, clean up workspace
---

{{SKILLS}}

> **HARD STOP CHECK**: Before doing anything else, read the Review output below.
> If it contains `Verdict: FAIL` or lists any critical or important issues:
> - Print: "FINISH BLOCKED: Review verdict is FAIL. Pipeline cannot proceed to delivery."
> - List the critical and important findings from the review output.
> - Do NOT write any code. Do NOT edit any files. Do NOT run tests. Do NOT create a PR.
> - Exit immediately.
>
> Only continue past this point if the review verdict is PASS with zero critical issues.

> **WORKSPACE SAFETY RULE**: Never delete `src/`, `tests/`, or any source code directory.
> The only files you may remove are `.spiq/` build artifacts — and only after the delivery
> action (PR / merge / push) has completed successfully. The worktree directory is cleaned
> up by the orchestrator after you exit; do NOT run `git worktree remove` yourself.

The review stage returned a PASS verdict. The pipeline is ready for delivery.

Spec: {{SPEC_FILE}}
Plan: {{PLAN_FILE}}
Todo: {{TODO_FILE}}
Review output: {{REVIEW}}
Feature branch: {{FEATURE_BRANCH}}

Follow the `finishing-a-development-branch` skill (`.spiq/skills/FINISHING_BRANCH.md`) to:

1. Run the final test suite and confirm it passes
2. Confirm there are no uncommitted changes
3. Produce a delivery summary from the spec, plan, and review verdict
4. Execute the delivery action (check `FINISH_ACTION` env var; default is `pr`)
5. Clean up the workspace

Delivery action values:
- `pr`      — create a pull request against main (default)
- `merge`   — merge the branch directly into main
- `keep`    — push the branch without merging or creating a PR
- `discard` — delete the branch (prints what will be lost before deleting)
