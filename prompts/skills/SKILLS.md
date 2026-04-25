# Available Agent Skills

This system provides the following skills for agent operations. Skills are injected as plain instructions into stage prompts — follow their guidance directly.

## Development Skills

- **spec-driven-development** — Write structured specifications before coding
- **planning-and-task-breakdown** — Break work into small, verifiable tasks
- **incremental-implementation** — Implement features incrementally with tests
- **test-driven-development** — Write failing tests first, then implement
- **debugging-and-error-recovery** — Systematic root-cause debugging
- **git-workflow-and-versioning** — Atomic commits, branch discipline, clean history

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

## Quality Skills

- **code-review-and-quality** — Five-axis review: correctness, readability, architecture, security, performance
- **security-and-hardening** — Input validation, XSS/injection prevention, auth patterns, secrets hygiene
- **performance-optimization** — Profiling, Core Web Vitals, bundle size, render performance

## Using Skills

Skills are compiled into stage prompts by the orchestrator. Their content is injected inline as plain instructions. You do not need to invoke them by name — just follow the guidance they contain.
