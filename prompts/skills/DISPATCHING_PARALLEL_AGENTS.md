---
name: dispatching-parallel-agents
description: Execute independent plan tasks in optimal order by reading dependency annotations. Use during the build stage when the plan identifies parallelizable tasks — identify the dependency graph, batch independent tasks, and dispatch them in dependency order to minimize build time.
---

# Dispatching Parallel Agents

## Overview

The plan stage produces a task list with dependency annotations. The build stage typically executes tasks sequentially, but many plans contain independent branches that do not need to wait for each other. This skill teaches agents to read the dependency graph, identify batches of independent tasks, and execute or coordinate them in the optimal order.

**The goal:** Reduce total build time by identifying which tasks block each other and which do not, then executing non-blocking tasks together rather than sequentially.

## When to Use

- During the build stage when the plan contains parallelization annotations ("parallel-safe after Task N", "independent of Task M", "can run concurrently")
- When the plan has clearly independent branches (e.g., auth module + data layer + UI components with no shared dependencies between them)
- When one task does not depend on any output from another task in the same batch

**When NOT to use:**
- Tasks with explicit dependencies ("requires Task 2 output") must run after their dependencies
- A single linear task list with no independence signals is sequential by design
- If the plan has no parallelization annotations, execute tasks in the listed order

## Reading Dependency Annotations

The plan may annotate dependencies in several forms:

```
Task 1: Set up database schema
Task 2: Implement user API (requires Task 1)
Task 3: Implement auth middleware (requires Task 1)
Task 4: Implement product API (requires Task 1)
Task 5: Write API tests (requires Tasks 2, 3, 4)
Task 6: Build frontend components (parallel-safe after Task 1)
```

From these annotations, build the dependency graph:

```
Task 1
├── Task 2 (depends on 1)
├── Task 3 (depends on 1)
├── Task 4 (depends on 1)
└── Task 6 (depends on 1)

Task 5 (depends on 2, 3, 4)
```

## Building Execution Batches

Group tasks into execution batches based on the dependency graph. A batch contains all tasks that:
1. Have their dependencies satisfied by prior batches
2. Do not depend on each other (within the batch)

```
EXECUTION BATCHES:

Batch 0 (no dependencies):
  - Task 1: Set up database schema

Batch 1 (depends only on Batch 0):
  - Task 2: Implement user API
  - Task 3: Implement auth middleware
  - Task 4: Implement product API
  - Task 6: Build frontend components

Batch 2 (depends on all of Batch 1):
  - Task 5: Write API tests

Critical path: Task 1 → {Task 2, Task 3, Task 4} → Task 5
```

Tasks within the same batch can run concurrently or be executed sequentially in any order. Tasks in later batches must wait for all tasks in prior batches to complete.

## Dispatch Strategies

### Strategy A: Sequential Batch Execution (Default)

Execute tasks within each batch one at a time, but in the batch-optimal order. This does not reduce wall-clock time but ensures the optimal execution order and prevents unnecessary blocking.

```
Execute Batch 0:
  [1] Task 1 — complete

Execute Batch 1 (all are now unblocked):
  [2] Task 2 — complete
  [3] Task 3 — complete
  [4] Task 4 — complete
  [6] Task 6 — complete (can interleave with 2, 3, 4 freely)

Execute Batch 2:
  [5] Task 5 — complete
```

### Strategy B: Parallel Dispatch (When Infrastructure Supports It)

When the orchestrator supports parallel subprocess dispatch, dispatch all tasks in a batch concurrently:

```bash
# Dispatch Batch 1 tasks in parallel (pseudocode)
node agent-cli.js --stage build --task 2 &
node agent-cli.js --stage build --task 3 &
node agent-cli.js --stage build --task 4 &
node agent-cli.js --stage build --task 6 &
wait  # wait for all Batch 1 tasks before dispatching Batch 2
```

Each task agent runs in an isolated context with the same workspace snapshot. After all tasks complete, their outputs are merged before the next batch begins.

### Strategy C: Priority-Based Sequential Execution

When parallel dispatch is not available, use the dependency graph to prioritize which sequential order minimizes the time until the most tasks are unblocked:

```
Priority order for Batch 1:
1. Execute Task 2 first (blocks Task 5)
2. Execute Task 3 next (blocks Task 5)
3. Execute Task 4 next (blocks Task 5)
4. Execute Task 6 last (does not block anything in subsequent batches)

Rationale: prioritize tasks that are on the critical path before tasks that are not.
```

## Handling Batch Failures

If a task in a batch fails:

```
BATCH FAILURE:
  Batch 1, Task 3 (auth middleware) — FAILED
  Dependent tasks: Task 5 (cannot proceed)
  Independent tasks: Task 4, Task 6 (may proceed)

Decision:
  - Task 4 and Task 6 have no dependency on Task 3 → continue executing them
  - Task 5 is blocked until Task 3 is fixed → pause Task 5
  - Fix Task 3, re-run it, then unblock Task 5
```

A failure in one task does not block independent tasks in the same or subsequent batches, unless they depend on the failed task's output.

## Documenting the Dispatch Plan

Before execution begins, document the batch plan:

```
DISPATCH PLAN

Total tasks: 6
Critical path: Task 1 → Task 2 → Task 5 (minimum 3 sequential steps)
Maximum parallelism: 4 tasks (Batch 1)

Batch 0 [sequential]: Task 1
Batch 1 [parallel-eligible]: Tasks 2, 3, 4, 6
Batch 2 [sequential]: Task 5

Expected sequential execution order: 1, 2, 3, 4, 6, 5
Optimized critical-path order:      1, 2, 3, 4, 5, 6
```

## Verification

After all batches complete:

- [ ] Every task in the plan has been executed
- [ ] No task was executed before its dependencies were satisfied
- [ ] All tasks completed successfully (or failures are documented with impact assessment)
- [ ] Merged outputs are consistent (no conflicts between parallel tasks)
- [ ] Batch execution log documents the order and outcome of each task
