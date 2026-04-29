---
description: Break work into small verifiable tasks with acceptance criteria, TDD ordering, and wave dependency structure
---

{{SKILLS}}

Read the existing spec ({{SPEC_FILE}}) and the relevant codebase sections. Then follow these steps:

**Step 0 — Research** _(mandatory when the feature touches external APIs, libraries, platforms, or data the executor cannot be expected to know)_

Read `.spiq/skills/RESEARCH.md` now. Then:

1. Identify every knowledge gap the executor will face: unknown APIs, third-party SDKs, platform behaviours, data formats, or real-world constraints not described in the spec.
2. For each gap, run a targeted query using Tavily, Firecrawl, or Apify (decision framework is in RESEARCH.md).
3. Compile all findings into a `## RESEARCH CONTEXT` section at the top of `{{PLAN_FILE}}` using the format in RESEARCH.md.

If no external knowledge is needed (pure refactoring, existing patterns only), write:
```
## RESEARCH CONTEXT
_Not required — task uses only existing codebase patterns._
```

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

**Step 7 — Finalise skill selection**

The build and test stages will only receive skills you confirm here. Use the catalog
below to finalise the list from what brainstorm and spec proposed.

{{SKILL_CATALOG}}

{{BRAINSTORM_SKILLS}}

Rules:
- Include every skill the build or test stages will directly exercise
- Remove any that do not apply to this specific task (no padding)
- 4 instead of 2 is fine; 7 instead of 2 is not
- Lean toward fewer — bloat slows the executor

Output this line immediately before the PLAN QUALITY GATE RESULT block in plan.md.
The orchestrator parses it; the format must be exact:

```
SELECTED_SKILLS: ["WEB_DEV", "API_DESIGN", "DATABASE"]
```

Save the plan to: {{PLAN_FILE}}
Save the task list to: {{PLAN_DIR}}/todo.md
