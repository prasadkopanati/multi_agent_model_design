# Available Agent Skills

This system provides the following skills for agent operations. Skills are injected as plain instructions into stage prompts — follow their guidance directly.

## Development Skills

- **brainstorming** — Socratic clarification before writing a spec; surfaces assumptions and alternatives
- **spec-driven-development** — Write structured specifications before coding
- **planning-and-task-breakdown** — Break work into small, verifiable tasks
- **incremental-implementation** — Implement features incrementally with tests
- **test-driven-development** — Write failing tests first, then implement
- **debugging-and-error-recovery** — Systematic root-cause debugging
- **git-workflow-and-versioning** — Atomic commits, branch discipline, clean history
- **dispatching-parallel-agents** — Execute independent plan tasks in batches; minimize build time via dependency-ordered dispatch
- **verification-before-completion** — Confirm work is actually done before declaring a stage complete; prevents silent false completion

## Web Skills

- **web-development** — Semantic HTML, CSS custom properties, vanilla JS, responsive design, accessibility
- **theme-factory** — CSS design token systems, light/dark mode, brand themes
- **web-artifacts** — Self-contained static deliverables that open via file:// with no server
- **content-creation** — UI copy, microcopy, headings, error messages, SEO metadata
- **browser-testing-with-devtools** — Playwright-based browser testing and Chrome DevTools MCP (Claude Code)

## Backend & Infrastructure Skills

- **api-design** — REST conventions, versioning, OpenAPI, error envelopes, pagination, auth headers
- **api-testing** — HTTP integration tests with supertest/httpx, auth flow testing, contract testing
- **database-development** — Schema design, migrations, parameterized queries, transactions, N+1 prevention
- **docker-and-containers** — Dockerfiles, multi-stage builds, docker-compose, health checks, env injection
- **pdf-operations** — Create, read, modify, merge, and fill PDF files using pdf-lib, pdf-parse, and Playwright

## Quality Skills

- **code-review-and-quality** — Five-axis review: correctness, readability, architecture, security, performance
- **requesting-code-review** — Produce a structured handoff document at build end; give reviewers a navigational map not just diffs
- **receiving-code-review** — Triage FAIL verdict findings by severity; address Critical first; verify each fix before resubmitting
- **security-and-hardening** — Input validation, XSS/injection prevention, auth patterns, secrets hygiene
- **performance-optimization** — Profiling, Core Web Vitals, bundle size, render performance

## Lifecycle Skills

- **finishing-a-development-branch** — Final verification, delivery summary, PR/merge/keep/discard, workspace cleanup
- **session-persistence** — Documents where completed pipeline runs are archived (prompt_vault/) and how to reference prior sessions or winning prompts

## Using Skills

Skills are compiled into stage prompts by the orchestrator. Their content is injected inline as plain instructions. You do not need to invoke them by name — just follow the guidance they contain.
