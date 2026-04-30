---
description: Apply targeted fixes from a failed code review — resolve critical and important issues surgically
---

{{SKILLS}}

**Context budget — follow these rules on every command or costs spiral:**
- Append `2>&1 | tail -50` to all test/build/lint commands. If the output is insufficient, re-run with `tail -100` or higher.
- Read skill files only when the task explicitly requires that skill. Each file at most once.
- Read source files using `offset` + `limit` parameters — never the entire file unless you are about to write to it.

The previous code review returned a **FAIL** verdict. Your job is to apply targeted fixes for every issue flagged.

Reference files (read only what you need):
- Spec: `{{SPEC_FILE}}`
- Plan: `{{PLAN_FILE}}`

## Review Output

{{REVIEW}}

---

## Fix Instructions

Read `.spiq/skills/EXECUTION_DISCIPLINE.md` and declare your fix scope before writing any code.

**Step 1 — Triage**

Parse the review output above and list:
- All **Critical** issues → you MUST fix every one
- All **Important** issues → fix every one (they affect correctness or spec compliance)
- All **Suggestions** → address only if low-risk and clearly beneficial; skip architectural changes

**Step 2 — Fix**

For each issue, in order of severity:
1. Read the affected file(s) — use `offset`+`limit`, not full reads
2. Apply the minimal change that resolves the issue
3. Do NOT touch code outside the files mentioned in the review issues — surgical changes only
4. Run the relevant test(s) to confirm the fix does not introduce regressions

After ALL fixes are applied and the full test suite is green, stage and commit everything in one shot:
```bash
git add -A
git status --short          # verify the staged set is correct before committing
git commit -m "fix(<scope>): <summary of all issues resolved>"
git log --oneline -3        # confirm the commit appears in the log
```

Do NOT commit file-by-file or use selective `git add <path>`. Using `git add -A` ensures no changed file is left unstaged.

**Step 3 — Output a FIX SUMMARY**

After all fixes are applied, output exactly this block as your final message:

```
FIX SUMMARY
Critical resolved: <n>/<total>
Important resolved: <n>/<total>
Suggestions addressed: <n>/<total>
Files changed: <comma-separated list>
```
