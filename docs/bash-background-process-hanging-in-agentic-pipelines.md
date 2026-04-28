# Bash Background Processes Hanging in Agentic Pipelines

## Summary

When an agentic executor (Gemini, OpenCode, or any headless agent) runs a shell command with `&` to background a long-running process, the process appears to be in the background but the bash tool never returns. The tool waits until its timeout is reached and then kills the entire command:

```
bash tool terminated command after exceeding timeout 30000 ms.
If this command is expected to take longer and is not waiting for interactive input,
retry with a larger timeout value in milliseconds.
```

The symptom is reproducible and consistent: increasing the timeout does not fix it, because the background process will run until the new timeout is reached and be killed again. The only thing that changes is how long the hang lasts.

The canonical trigger in agenticspiq is the development server step in the test stage prompt:

```bash
python3 -m http.server 8000 &   # hangs the bash tool
```

The fix is a single addition — redirect stdout and stderr before backgrounding:

```bash
python3 -m http.server 8000 > /dev/null 2>&1 &   # returns immediately
```

---

## Why This Matters for Agentic Pipelines

**gstack context:** gstack's `/qa` skill and the browser gate in agenticspiq's `REGRESSION_GUARD.md` require serving the project locally and running a Playwright smoke check against it. The standard idiom for this — start an HTTP server in the background, run tests, kill the server — is a routine shell pattern that every developer uses. But it breaks silently in agentic bash contexts for reasons that are non-obvious and not documented anywhere. Every agent will reach for `&` because that is what every tutorial shows. Every agent will hang. The fix is not intuitive because `&` appears to work: the shell line runs, the PID is echoed, and then nothing happens until timeout.

Understanding the mechanism is the only reliable way to prevent this pattern from reappearing across multiple skill files, agents, and pipeline stages.

---

## The Mechanism

### What `&` actually does

In a standard interactive shell, `command &` starts the command as a background job and immediately prints `[job_number] PID`. The shell returns to the prompt. The background process runs concurrently. This works because:

1. The terminal's stdin/stdout/stderr are shared between the shell and the background process
2. Both write to the same terminal device (a tty)
3. When the shell returns to the prompt, it doesn't "close" stdout — the terminal stays open
4. The background process can write freely without affecting the shell's interactive state

### What the bash tool's execution context looks like

The bash tool (and every `spawnSync` call in agenticspiq's runners) executes commands in a **non-interactive subshell** with **piped I/O**:

```
bash tool                         subshell                    background process
─────────                         ────────                    ──────────────────
stdin  ──────── pipe ──────────→  stdin                       (inherits shell stdin)
stdout ←─────── pipe ────────────  stdout          ←────────  (inherits shell stdout)
stderr ←─────── pipe ────────────  stderr          ←────────  (inherits shell stderr)
```

The bash tool writes the command to the subshell's stdin and reads output from stdout/stderr pipes. It signals "done" by closing its write end of the stdin pipe and waiting for EOF on the stdout/stderr pipes.

EOF on stdout/stderr arrives only when **all processes with the write end open have closed it**. In a normal (no `&`) command, that's just the command itself. When it exits, EOF arrives, the bash tool reads all output, and returns.

### Why `&` breaks this

When the subshell runs `python3 -m http.server 8000 &`:

1. The subshell forks the HTTP server as a background process
2. The HTTP server **inherits the shell's stdout and stderr** — the same pipes the bash tool is reading from
3. The shell itself exits (the `&` command is instantaneous)
4. The bash tool is now waiting for EOF on the stdout/stderr pipes
5. EOF will never arrive because the HTTP server has the write end of both pipes open
6. The HTTP server runs indefinitely, logging requests to the pipe
7. The bash tool blocks reading from the pipe, waiting for EOF that never comes
8. After the timeout, the bash tool kills the subshell's process group — which kills the HTTP server — and reports the timeout error

The `&` moved the process to the background *within the shell*, but it did nothing to disconnect the process from the inherited pipe file descriptors. From the bash tool's perspective, there is still an active writer on stdout/stderr. It cannot know whether that writer will produce more output or not. It waits.

### The file descriptor lifecycle

To make this concrete, here is the state of the stdout pipe's write-end across both cases:

**Without `> /dev/null 2>&1`:**

| Process | Holds write-end of stdout pipe? |
|---|---|
| bash tool | closes it after writing the command (signals done) |
| subshell | opens it on launch, closes on exit ✓ |
| `python3 -m http.server` | inherits from subshell — **keeps it open indefinitely** ✗ |

The bash tool is waiting for EOF. The HTTP server holds the write-end open. Deadlock.

**With `> /dev/null 2>&1`:**

| Process | Holds write-end of stdout pipe? |
|---|---|
| bash tool | closes it after writing the command |
| subshell | opens it on launch, closes on exit ✓ |
| `python3 -m http.server` | stdout/stderr redirected to `/dev/null` — **does not hold the pipe open** ✓ |

The shell exits, all write-ends of the pipe close, EOF arrives, the bash tool reads any remaining output and returns. The HTTP server runs independently, writing to `/dev/null`.

---

## The Fix

### Minimum required change

```bash
# HANGS — inherits pipe file descriptors
python3 -m http.server 8000 &

# WORKS — redirected before fork; does not inherit pipe fds
python3 -m http.server 8000 > /dev/null 2>&1 &
```

The redirection must happen **before the `&`**, so it applies to the forked process, not to the parent shell.

### Canonical pattern for agentic test stages

Always store the PID and kill the server after tests complete. A server left running after the test session pollutes the environment for subsequent commands:

```bash
# Start the server — redirect both stdout and stderr
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!

# Brief wait for the port to bind (http.server is fast, but not instant)
sleep 1

# Confirm the server is up before running tests
curl -s -o /dev/null -w "Server status: %{http_code}\n" http://localhost:8000/

# Run tests
npx playwright test

# Kill the server regardless of test outcome
kill $SERVER_PID 2>/dev/null
```

### When `npx serve` is used instead

The same issue applies. `npx serve .` without redirection hangs identically:

```bash
# HANGS
npx serve . --listen 8000 &

# WORKS
npx serve . --listen 8000 > /dev/null 2>&1 &
SERVER_PID=$!
```

### `nohup` as an alternative

`nohup` closes stdin and redirects stdout/stderr to `nohup.out`, which achieves the same disconnection from the pipe:

```bash
nohup python3 -m http.server 8000 &
```

The `nohup.out` file accumulates server logs, which can be useful for debugging failed browser tests. For production pipeline use, `> /dev/null 2>&1 &` is cleaner (no log file accumulation across test runs).

---

## Why Increasing the Timeout Does Not Help

The bash tool timeout error message says:

> "retry with a larger timeout value in milliseconds"

This advice applies to commands that are expected to complete but just take longer than the default (e.g., a large `pip install`, a slow build). It does not apply here. The HTTP server runs until killed. No timeout value will make it complete — it will always be killed at the timeout boundary. The fix is not a larger timeout; the fix is the `> /dev/null 2>&1` redirection.

---

## Impact on agenticspiq

### Test stage

The `test.md` prompt includes an HTTP server step for projects with frontend output:

```bash
# Old (hangs)
python3 -m http.server 8000 &
```

Updated to the correct pattern in `prompts/test.md`:

```bash
# New (returns immediately)
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!
# ... run tests ...
kill $SERVER_PID 2>/dev/null
```

### Finish stage canary (`POST_DEPLOY_CANARY.md`)

The canary skill performs a smoke check after `FINISH_ACTION=merge`. If the smoke check requires serving a local page (e.g., for pre-deploy verification against a local build), the same pattern applies:

```bash
python3 -m http.server 8000 > /dev/null 2>&1 &
CANARY_SERVER_PID=$!
# ... run smoke check ...
kill $CANARY_SERVER_PID 2>/dev/null
```

### OpenCode executor

OpenCode's runner (`agent-cli/runners/opencode.js`) uses `spawnSync` with piped I/O — the same execution context described above. Any `&` command in OpenCode's shell calls is subject to this hang. The prompt instructions are the only reliable enforcement point because there is no way to retrofit `> /dev/null 2>&1` at the runner level without modifying every command the agent issues.

---

## Reproducing and Verifying the Fix

**Reproduce the hang** (bash tool will hit timeout):

```bash
python3 -m http.server 8000 &
```

**Verify the fix** (bash tool returns immediately, curl confirms server is up):

```bash
python3 -m http.server 8000 > /dev/null 2>&1 &
echo $!
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
```

Expected output:

```
<PID>
200
```

The PID confirms the server started. The 200 confirms it is serving. The bash tool returned immediately.

---

## Broader Principle for Agentic Shell Execution

Any long-running process started with `&` in a non-interactive bash context (bash tool, `spawnSync` with piped stdio, CI runners, Docker `RUN` commands) will hang if its inherited file descriptors keep the parent's pipes open. The pattern is not specific to HTTP servers:

| Command | Why it hangs without redirection |
|---|---|
| `python3 -m http.server PORT &` | Logs every request to inherited stdout |
| `npx serve . --listen PORT &` | Same — verbose by default |
| `redis-server &` | Logs startup and commands to inherited stdout |
| `postgres -D /var/db/postgres &` | Logs to inherited stderr |
| `node server.js &` | Logs to stdout by default |
| `tail -f logfile &` | Streams indefinitely to stdout |

The rule: **any background process that writes to stdout or stderr will hang a piped bash context.** Redirect both before backgrounding, store the PID, and kill on exit.

---

## File Inventory

| File | Role |
|---|---|
| `prompts/test.md` | Updated HTTP server example to include `> /dev/null 2>&1 &` and PID storage |
| `prompts/skills/REGRESSION_GUARD.md` | Browser gate references HTTP server — same pattern applies |
| `prompts/skills/POST_DEPLOY_CANARY.md` | Canary smoke check may require local serve — documented |
| `mat_uwk_rfp_kimik25/requirements.txt` | Fixed: added `anthropic`, `openai`, `python-dotenv` (were missing) |
| `mat_uwk_rfp_kimik25/pyproject.toml` | Added: `testpaths = ["tests"]` so pytest discovery is bounded |
