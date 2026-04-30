---
description: Implement the next task incrementally — write failing tests first, then implement to pass them, then commit
---

{{HANDOFF}}

{{SKILLS}}

**Context budget — follow these rules on every command or costs spiral:**
- Append `2>&1 | tail -50` to all test/build/lint commands. If the output is insufficient to diagnose a failure, re-run with `tail -100` or higher.
- Read skill files only when the task explicitly requires that skill. Each file at most once.
- Read source files using `offset` + `limit` parameters — never the entire file unless you are about to write to it.

**Session length guard:** If you have submitted more than 80 model requests in this session, run `/compact` before continuing. A build that accumulates 100+ requests leaves the test stage with near-zero context and reasoning budget.

Before writing any code, read `.spiq/skills/EXECUTION_DISCIPLINE.md` and output this block:

```
EXECUTION SCOPE

Task:            [one sentence — what this build is implementing]
Files to CREATE: [list, or "none"]
Files to MODIFY: [list, or "none"]
Files to DELETE: [list, or "none"]
Files OFF-LIMITS: [everything not listed above — do not touch]
Max diff lines:  ~300
```

Do not write a single line of code until this block is output.

After `npm install`, determine the project's module system before writing any imports:

```
$ cat tsconfig.json | grep '"module"'
$ cat package.json | grep '"type"'
```

- If `module` is `"CommonJS"` (or absent) AND `type` is `"commonjs"` (or absent):
  → CJS project. Use bare relative imports: `import { Foo } from './utils/foo'` (no `.js` extension).
  → Do NOT use `ts-node` to run app files — use `npm test` and `npm run typecheck` only.
- If `module` is `"node16"` / `"nodenext"` / `"ESNext"` OR `type` is `"module"`:
  → ESM project. Use explicit `.js` extensions: `import { Foo } from './utils/foo.js'`.

When creating or modifying `vitest.config.ts`, always include:

```typescript
testTimeout: 10000,  // 10-second hard limit per test — hanging tests mean real HTTP calls
```

HTTP client modules (anything calling `fetch()`, `axios()`, or a third-party SDK) **MUST** be mocked in unit tests using `vi.mock()`. Real API calls from tests will hang indefinitely without credentials and block the pipeline.

---

**Repeat the following cycle for EVERY task in the plan. The TDD gate applies to every task without exception — not just the first.**

For each task:

1. Read the task's acceptance criteria
2. Load relevant context (existing code, patterns, types)
   - Check installed package type definitions first: `ls node_modules/<pkg>/dist/*.d.ts` and read the `.d.ts` file before reaching for a web search.

**TDD GATE — MANDATORY PER TASK — DO NOT SKIP OR REORDER**

3. Write failing tests for the expected behavior
   - Run `git diff --staged 2>&1 | tail -50` to confirm what you are staging
   - Commit the tests:
     ```
     git commit -m "test(<scope>): <description of what is being tested>

     Co-Authored-By: OpenCode Agent <opencode-agent@agenticspiq.local>"
     ```
   - Run the test suite: `npm test 2>&1 | tail -50`
   - Tests MUST fail at this point. If they fail due to module resolution (file does not exist), the RED gate is met — the module simply doesn't exist yet. Move to step 4.
   - If tests pass before any implementation: your tests do not cover new behavior — rewrite them.
   - **Once tests are confirmed failing, the RED gate is met. Do NOT re-commit the test files. Move immediately to step 4.**
   - After committing, run this check before the next action:
     ```
     EXECUTION CHECK
       Files changed this commit: [list]
       All in declared scope?     [yes / no — if no, STOP and explain]
       Diff lines this commit:    [count]
       Single concern?            [yes / no — if no, split the commit]
       Tests updated/added?       [yes / no]
     ```

4. Implement the minimum code to make the failing tests pass — one module at a time:
   - Implement the minimum code for one module
   - Run `npm test 2>&1 | tail -50` — that module's tests must now pass
   - Run `git diff --staged 2>&1 | tail -50` to confirm what you are staging
   - Commit the implementation:
     ```
     git commit -m "feat(<scope>): <description of what was implemented>

     Co-Authored-By: OpenCode Agent <opencode-agent@agenticspiq.local>"
     ```
   - Run EXECUTION CHECK (same block as above)
   - Move to the next module. Do not batch multiple modules into one commit.

5. Run the full test suite — new tests must pass, no regressions allowed: `npm test 2>&1 | tail -50`
6. Run the build to verify compilation: `npm run typecheck 2>&1 | tail -50`
7. For any HTML output, run static validation:
   ```
   npx htmlhint **/*.html
   ```
   Fix all reported errors before proceeding. Do NOT check for `html5validator` or fall back to manual browser verification.
8. Mark the task complete in `.spiq/tasks/todo.md` and return to step 1 for the next task.

---

After all tasks in this build are complete:

**Pre-handoff git check — required before writing the handoff summary:**

```
$ git status --short
```

If any files appear (`M`, `??`, `A`, `D`) that are not `.spiq`:
- Stage and commit any remaining implementation: `git add <files> && git commit -m "..."`
- Restore any out-of-scope modifications: `git checkout -- <file>`
- Only untracked `.spiq` entries are acceptable — those are pipeline state, not code.

A dirty working tree at handoff means the test stage will run against uncommitted code. This corrupts the test → review audit trail.

Once the working tree is clean, produce a BUILD HANDOFF SUMMARY (read `.spiq/skills/BUILD_HANDOFF_SUMMARY.md` for the required format) and write it to `.spiq/handoff.md`.

If any step fails, apply the debugging and error recovery process from the skills above.
