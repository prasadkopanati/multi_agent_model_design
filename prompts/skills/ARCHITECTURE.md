# Architecture Guidelines

## System Overview

This is a multi-agent coding system with:

- **Controller** (Claude) - Planning, spec, review
- **Executor** (OpenCode) - Build, test, fix loops
- **Orchestrator** - State machine, routing, retries

## Core Principles

1. **Separate thinking from doing**
2. **Artifact-driven state** - No hidden memory
3. **Constrained execution** - Minimal diffs, explicit scopes
4. **Failure-guided iteration** - Learn without fine-tuning

## Directory Structure

```
orchestrator/     - State machine and orchestration logic
agent-cli/        - CLI entry point for agents
prompts/          - Stage prompts and skills
artifacts/        - Generated outputs and logs
worktrees/        - Git worktrees for isolation
repo/             - Working repository
```
