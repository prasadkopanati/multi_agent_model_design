# TODO — Issue Backlog

Issues identified during code review, ordered by severity.

---

## Critical

These will cause crashes or security vulnerabilities in normal operation. Fix before any execution.

- [x] **Circular dependency — `orchestrator.js` ↔ `retry.js` causes `runStage` to be `undefined` at retry time**
  - `retry.js` top-level imports `orchestrator.js`; `orchestrator.js` lazily requires `retry.js` to paper over the cycle. Node returns a partially-evaluated module, so `runStage` is `undefined` when first retry fires → `TypeError` crash.
  - Fix: introduce a `pipeline.js` that owns the stage loop and imports both modules without a cycle, or pass `runStage` as a parameter into `retryStage`.
  - Files: `orchestrator/orchestrator.js:37`, `orchestrator/retry.js:2`

- [x] **Command injection in `claude.js` runner — prompt content executed as shell**
  - Only `"` is escaped before interpolation into a shell string. Backticks or `$()` in any prompt file execute arbitrary commands on the host.
  - Fix: use `spawnSync` with an args array (no shell), or write the system prompt to a temp file and pass its path as a flag.
  - File: `agent-cli/runners/claude.js:7-14`

- [x] **Same command injection in `opencode.js` runner**
  - Identical root cause and fix as above.
  - File: `agent-cli/runners/opencode.js:7-13`

---

## High

These produce wrong behavior silently — incorrect retries, bypassed context — but won't crash on the happy path.

- [x] **Global failure counter — retry budget is shared across all stages**
  - A single `failure_state.count` in `tasks.json` accumulates across every stage. Two failures in `spec` + one in `build` triggers escalation during `build` even though `build` only failed once.
  - Fix: track and evaluate `shouldEscalate` per-stage by filtering `failure_state.history` for the current stage.
  - File: `orchestrator/retry.js:4-24`

- [x] **Runners bypass compiled prompt — skills and failure context are discarded**
  - Both runners re-read `prompts/${stage}.md` directly (the raw template), ignoring the compiled file written to `artifacts/compiled/` by the orchestrator. All `{{SKILLS}}` and `{{FAILURE}}` injections are thrown away.
  - Fix: runners should use the `input` argument they already receive, which points to the compiled artifact.
  - Files: `agent-cli/runners/claude.js:5`, `agent-cli/runners/opencode.js:5`

- [x] **`workspace` flag accepted by `agent-cli` but never used by runners**
  - `orchestrator.js` passes `--workspace` to `agent-cli`, and `agent-cli.js` parses it, but neither runner does anything with it. The executor never changes directory to the worktree.
  - Fix: pass `workspace` into both runners and use it as the `cwd` option in `execSync`/`spawnSync`.
  - Files: `orchestrator/orchestrator.js:29`, `agent-cli/runners/claude.js`, `agent-cli/runners/opencode.js`

- [x] **No tests for any orchestrator logic**
  - Zero tests exist for retry counting, escalation boundary, failure capture, or prompt compilation. Critical edge cases (retry limit off-by-one, missing placeholder) are unverifiable.
  - Fix: add unit tests for `captureFailure`, `retryStage` (escalation at limit), and `compilePrompt` (placeholder substitution, unknown stage).

---

## Medium

These produce subtle, hard-to-debug failures depending on environment or template content.

- [x] **All file paths are relative — breaks if CWD is not the repo root**
  - Every `fs.readFileSync`/`writeFileSync` uses bare relative paths (`artifacts/...`, `prompts/...`, `tasks.json`). Running from any other directory silently reads/writes the wrong location.
  - Fix: resolve all paths with `path.join(__dirname, '..', ...)` relative to the file's own location.
  - Files: `orchestrator/orchestrator.js:24`, `orchestrator/retry.js:5`, `orchestrator/promptCompiler.js:4,21`

- [x] **`promptCompiler.js` uses `replace()` — only substitutes first occurrence of each placeholder**
  - `String.prototype.replace` with a string pattern stops at the first match. A template with `{{SKILLS}}` appearing twice leaves the second as a literal string passed to the model.
  - Fix: use `replaceAll()` or a global regex (`/{{SKILLS}}/g`) for each substitution.
  - File: `orchestrator/promptCompiler.js:23-25`

- [x] **`{{DEBUGGING}}` placeholder in `failure.md` is never substituted**
  - `prompts/failure.md:20` contains `{{DEBUGGING}}` but `compilePrompt` only handles `{{SKILLS}}`, `{{FAILURE}}`, and `{{PLAN}}`. The literal string is passed to the model.
  - Fix: add a `DEBUGGING` entry to `compilePrompt`, or remove the placeholder from the template.
  - Files: `prompts/failure.md:20`, `orchestrator/promptCompiler.js`

- [x] **Pipeline does not thread artifacts between stages**
  - `runPipeline` calls every stage with empty context. The spec output is never passed to plan, and the plan output is never passed to build, even though `compilePrompt` supports `context.plan`.
  - Fix: read each stage's output artifact after it completes and pass relevant fields as context to the next stage.
  - File: `orchestrator/orchestrator.js:42-50`

---

## Low

Polish and correctness issues that are unlikely to cause failures in practice but should be cleaned up.

- [x] **Two `Date.now()` calls in `failure.js` can produce different timestamps**
  - `failure.timestamp` and the filename each call `Date.now()` independently. They will almost always match but are semantically the same instant.
  - Fix: capture `const ts = Date.now()` once and use it for both.
  - File: `orchestrator/failure.js:8,11`

- [x] **`retryStage` passes raw error string, not structured failure-analysis output**
  - `retryStage` calls `runStage(stage, workspace, { failure: failure.error })` where `failure.error` is a stringified `Error`. The failure-analysis stage described in CLAUDE.md (which produces structured JSON with `root_cause`, `fix_strategy`, etc.) is never invoked in the retry path.
  - Fix: invoke the failure-analysis agent between failure capture and retry; pass its structured output as retry context.
  - File: `orchestrator/retry.js:39`

- [x] **Arg parser in `agent-cli.js` misparses flags without values**
  - A typo like `--agent --stage build` silently sets `agent = "--stage"`. No validation catches this.
  - Fix: validate that a parsed value doesn't start with `--`, or replace the hand-rolled parser with `minimist` / `parseArgs` from `node:util`.
  - File: `agent-cli/agent-cli.js:9-13`

- [x] **`npm start` does nothing — `orchestrator.js` exports functions but has no invocation**
  - `node orchestrator/orchestrator.js` loads the module and exits immediately; `runPipeline` is never called.
  - Fix: add a `bin/run.js` entry point that reads a `--workspace` arg and calls `runPipeline(workspace)`, or move the invocation into `orchestrator.js` behind a `require.main === module` guard.
  - Files: `package.json:7`, `orchestrator/orchestrator.js`

---

## Critical (round 2)

- [x] **Runners send no user-turn content — all agent invocations will hang or error**
  - `stdio: ["inherit", "pipe", "inherit"]` leaves stdin connected to the parent process (empty/closed in CI). `claude -p` and `opencode -p` both require a user message to produce output; passing only `--system` with no stdin content means every stage invocation either hangs waiting for input or exits with an error.
  - Fix: open the compiled input file as stdin — `input: fs.openSync(inputFile, 'r')` — or pipe it directly: `input: fs.readFileSync(inputFile)`.
  - Files: `agent-cli/runners/claude.js:12`, `agent-cli/runners/opencode.js:12`

- [x] **`failure.test.js` writes to the real project directory, not the temp dir**
  - `FAILURES_DIR` is resolved from `__dirname` at module load time (absolute path). `process.chdir(tmpDir)` does not redirect it. The test creates `tmpDir/artifacts/failures/` but `captureFailure` writes to `<project>/artifacts/failures/`, polluting the real repo on every run.
  - Fix: either accept the failures directory as a parameter to `captureFailure` or use a module-mocking approach to override `FAILURES_DIR` to the temp path before requiring the module.
  - File: `tests/failure.test.js:10-36`

---

## High (round 2)

- [x] **Shell injection in `orchestrator.js` `execSync` call via unsanitized `workspace`**
  - `workspace` is user-supplied and interpolated directly into a shell command string. A path with spaces breaks the command; a path with shell metacharacters is exploitable. This is the same class of bug that was fixed in the runners in this batch.
  - Fix: replace `execSync` with `spawnSync` and pass args as an array.
  - File: `orchestrator/orchestrator.js:43-46`

- [x] **Output directories not created before first write**
  - `fs.writeFileSync` into `COMPILED_DIR` and `FAILURES_DIR` throws `ENOENT` if those directories don't exist. Now that all paths are absolute, there's no accidental fallback.
  - Fix: add `fs.mkdirSync(dir, { recursive: true })` before the first write in each module, or assert directory existence at startup.
  - Files: `orchestrator/orchestrator.js:39`, `orchestrator/failure.js:18`

- [x] **`analyzeFailure` doesn't validate the parsed JSON shape**
  - `JSON.parse(fs.readFileSync(outputPath))` succeeds for any valid JSON. If the agent returns `{}` or a mismatched schema, the malformed object silently propagates into `runStage`'s context and corrupts the retry prompt.
  - Fix: check that the parsed object has the expected fields (`root_cause`, `fix_strategy`, `affected_files`, `confidence`) and return `null` if the check fails.
  - File: `orchestrator/retry.js:37`

- [x] **`retry.test.js` "analyzeFailure failure" test is a simulation, not a real test**
  - The test manually re-implements the catch-swallow-null-fallback logic rather than calling `retryStage`. The actual function is never exercised, so a regression in `retryStage` would not be caught.
  - Fix: export `analyzeFailure` (or accept it as a parameter) so it can be called directly with a throwing `runStage` stub.
  - File: `tests/retry.test.js:54-103`

---

## Low (round 2)

- [x] **`--output` omitted from `agent-cli` invocation in `orchestrator.js`**
  - The runner falls back to a relative `artifacts/output/${stage}.json`, which only resolves correctly if CWD is the project root. `readOutputArtifact` uses an absolute path, so the two will diverge if CWD differs.
  - Fix: pass `--output <absolute-path>` explicitly when invoking `agent-cli`.
  - File: `orchestrator/orchestrator.js:43-46`

- [x] **`failure_state.count` incremented globally but never used for escalation**
  - `shouldEscalate` now uses per-stage history count. The global `count` field is maintained but never read for any decision, which is misleading.
  - Fix: remove it, or add a comment marking it as a monitoring/observability counter only.
  - File: `orchestrator/retry.js:10`

- [x] **`DEBUGGING.md` always loaded in `compilePrompt` regardless of template content**
  - `load("DEBUGGING.md")` runs on every call even when the template has no `{{DEBUGGING}}` placeholder, adding an unnecessary filesystem read per stage.
  - Fix: check `template.includes("{{DEBUGGING}}")` before loading, or load lazily.
  - File: `orchestrator/promptCompiler.js:33`

- [x] **`readOutputArtifact` uses redundant `existsSync` + `try/catch`**
  - The `existsSync` check is redundant; the `try/catch` already handles both the missing-file and read-error cases.
  - Fix: remove the `existsSync` guard and rely on the catch block alone.
  - File: `orchestrator/orchestrator.js:26-30`
