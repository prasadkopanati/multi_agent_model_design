---
description: Implement the next task incrementally — write failing tests first, then implement to pass them, then commit
---

{{SKILLS}}

Before writing any code, read `.spiq/skills/EXECUTION_DISCIPLINE.md` and declare your execution scope.

Pick the next pending task from the plan. For each task:

1. Read the task's acceptance criteria
2. Load relevant context (existing code, patterns, types)

**TDD GATE — MANDATORY — DO NOT SKIP OR REORDER**

3. Write failing tests for the expected behavior
   - Commit the tests with prefix `test(<scope>): <description of what is being tested>`
   - Run the test suite — tests MUST fail at this point
   - If they pass before any implementation: your tests do not cover new behavior — rewrite them
   - **No `feat(...)` commit may precede its corresponding `test(...)` commit**

4. Implement the minimum code to make the failing tests pass
   - Commit the implementation with prefix `feat(<scope>): <description of what was implemented>`
   - Do not add behavior not covered by the tests you just wrote

5. Run the full test suite — new tests must pass, no regressions allowed
6. Run the build to verify compilation
7. For any HTML output, run static validation:
   ```
   npx htmlhint **/*.html
   ```
   Fix all reported errors before proceeding. Do NOT check for `html5validator` or fall back to manual browser verification.
8. Mark the task complete and move to the next one

After all tasks in this build are complete, produce a BUILD HANDOFF SUMMARY as the final output (read `.spiq/skills/BUILD_HANDOFF_SUMMARY.md` for the required format).

If any step fails, apply the debugging and error recovery process from the skills above.
