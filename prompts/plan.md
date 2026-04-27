---
description: Break work into small verifiable tasks with acceptance criteria, TDD ordering, and wave dependency structure
---

{{SKILLS}}

Read the existing spec ({{SPEC_FILE}}) and the relevant codebase sections. Then follow these steps:

**Step 1 — Dependency graph**
Identify all components and their dependencies. Determine which can be built in parallel (no shared dependency) and which must be sequential.

**Step 2 — Wave structure**
Group tasks into waves using the dependency graph. Tasks in the same wave have no dependency on each other and can be worked in parallel. Tasks in later waves depend on earlier waves.

```
Wave 1: [tasks with no dependencies]
Wave 2: [tasks that depend only on Wave 1]
Wave 3: [tasks that depend on Wave 2]
```

For any wave with multiple independent tasks, read `.spiq/skills/DISPATCHING_PARALLEL_AGENTS.md` to understand how the orchestrator can exploit that parallelism.

**Step 3 — Vertical slices**
Slice work vertically: one complete end-to-end path per task, not horizontal layers. Avoid tasks like "set up database models" that produce no testable behavior.

**Step 4 — TDD task ordering (MANDATORY)**
For every task that creates or modifies logic, behavior, or data flow, the plan MUST include a test task that immediately precedes it:

```
CORRECT:
  Task N:   Write failing tests for <feature>      [test: commit]
  Task N+1: Implement <feature>                    [feat: commit]

INCORRECT:
  Task N:   Implement <feature>                    (no preceding test task — plan is invalid)
```

Pure visual/CSS/layout tasks may be marked `[visual]` and do not require a preceding test task. Every other task requires one.

**Step 5 — Task spec**
For each task, document:
- **Files**: which specific files will be created or modified
- **Action**: what specifically will be done (not "implement auth" — be precise)
- **Verify**: what command or check confirms it is done
- **Done**: the observable acceptance criterion

**Step 6 — Plan quality gate**
Before saving the plan, run all five gates from `.spiq/skills/PLAN_QUALITY_GATE.md`:
1. Requirement Coverage — every spec requirement maps to a task
2. Scope Reduction Scan — no "placeholder", "v1", "stub" language
3. Task Completeness — every task has files/action/verify/done
4. TDD Ordering — test task precedes every non-visual logic task
5. Scope Sanity — ≤ 4 tasks; split into part-A / part-B if exceeded

Include the PLAN QUALITY GATE RESULT block at the top of plan.md before the task list.

Save the plan to: {{PLAN_FILE}}
Save the task list to: {{PLAN_DIR}}/todo.md
