---
description: Complete the development lifecycle — final verification, delivery summary, execute delivery action, clean up workspace
---

{{SKILLS}}

The review stage returned a PASS verdict. The pipeline is ready for delivery.

Spec: {{SPEC_FILE}}
Review output: {{REVIEW}}

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
