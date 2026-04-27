# Gemini CLI 0.39 — Shell Command Confirmation in Headless YOLO Mode

## Summary

Gemini CLI 0.39 introduced a new shell-command heuristics layer inside its policy engine. This layer forces `ASK_USER` for commands it classifies as "dangerous" (e.g. `rm -rf`, `find -exec`, `sudo rm`, etc.) **even when `--approval-mode yolo` is set**. When Gemini is running in non-interactive headless mode (`-p`), an `ASK_USER` decision immediately throws:

```
Error executing tool run_shell_command: Tool execution for "Shell" requires user confirmation,
which is not supported in non-interactive mode.
```

This causes the entire Gemini agent process to exit non-zero, breaking any pipeline stage that uses Gemini as a headless executor.

---

## Affected Versions

| Component | Version | Behaviour |
|---|---|---|
| `@google/gemini-cli` | `< 0.39` | `--approval-mode yolo` suppresses all confirmations in headless mode |
| `@google/gemini-cli` | `>= 0.39` | Shell heuristics override YOLO for "dangerous" commands — throws in headless |

Check your version: `gemini --version`

---

## Why `--approval-mode yolo` Is Not Enough

### The YOLO no-match shortcut

The policy engine's `check()` method has a fast-exit in YOLO mode:

```js
// chunk-GDRLBWZL.js — PolicyEngine.check()
if (decision === void 0) {             // no rule matched
  if (this.approvalMode === ApprovalMode.YOLO) {
    return { decision: PolicyDecision.ALLOW };  // fast allow
  }
}
```

This shortcut fires when **no rule matches** the tool call. The problem is that the bundled `policies/yolo.toml` (shipped inside the npm package) contains a wildcard rule that *does* match every tool in YOLO mode:

```toml
# bundled: @google/gemini-cli/bundle/policies/yolo.toml
[[rule]]
toolName = "*"
decision = "allow"
priority = 998          # effective priority: 1.998 (default tier)
modes = ["yolo"]
allowRedirection = true
```

Because a rule **is** matched, the fast-exit never fires. Execution falls through to per-tool processing.

### The heuristics gate

For `run_shell_command`, after a rule is matched, the engine calls `applyShellHeuristics()` — **but only when the matched rule has no `commandPrefix` and no `argsPattern`**:

```js
if (!skipHeuristics && isShellCommand && command
    && !("commandPrefix" in rule) && !rule.argsPattern) {
  ruleDecision = await this.applyShellHeuristics(command, ruleDecision);
}
```

The wildcard `toolName = "*"` rule has neither property, so heuristics run. Inside `applyShellHeuristics`:

```js
if (this.sandboxManager.isDangerousCommand(parsedArgs)) {
  return PolicyDecision.ASK_USER;  // overrides ALLOW regardless of mode
}
```

### Commands classified as dangerous

The heuristics treat the following as dangerous:

| Command | Dangerous condition |
|---|---|
| `rm` | `-f`, `-rf`, or `-fr` flag present |
| `sudo` | Any dangerous sub-command |
| `find` | Any of `-exec`, `-execdir`, `-ok`, `-okdir`, `-delete`, `-fls`, `-fprint`, `-fprint0`, `-fprintf` |
| `rg` (ripgrep) | `--pre`, `--hostname-bin`, `--search-zip`, `-z` |

Any of the above trigger `ASK_USER`, which throws in non-interactive (`-p`) mode.

### The throw site

```js
// chunk-GDRLBWZL.js — checkPolicy()
if (decision === PolicyDecision.ASK_USER) {
  if (!config.isInteractive()) {
    throw new Error(
      `Tool execution for "${tool.displayName || tool.name}" requires user confirmation,`
      + ` which is not supported in non-interactive mode.`
    );
  }
}
```

---

## The Fix — Custom Policy File

Rules that have `argsPattern` (or `commandPrefix` / `commandRegex`) skip the heuristics gate entirely. A higher-priority user-tier rule with `commandRegex = ".*"` matches every `run_shell_command` call, returns `ALLOW`, and **never reaches** `applyShellHeuristics`.

### 1. Create the policy file

`policies/yolo-allow-shell.toml` (already committed to this repo):

```toml
[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 999          # effective user-tier priority: 4.999 — beats 1.998
modes = ["yolo"]
commandRegex = ".*"     # sets argsPattern → heuristics are skipped
allowRedirection = true
```

**Priority arithmetic:**
- Bundled `yolo.toml` wildcard rule: tier 1 + 0.998 = **1.998**
- Our rule via `--policy` (user tier 4): 4 + 0.999 = **4.999**

The engine sorts rules by descending priority, so our rule is evaluated first and matched before the wildcard.

**Why `commandRegex = ".*"` is the key ingredient:**
When `buildArgsPatterns()` processes a `commandRegex`, it produces an `argsPattern` string (`"command":".*`). The compiled policy rule therefore has `rule.argsPattern` set. The heuristics gate checks `!rule.argsPattern` — which is now `false` — so `applyShellHeuristics` is never called.

### 2. Pass `--policy` in the Gemini runner

`agent-cli/runners/gemini.js` now resolves the policy file path and passes it on every invocation:

```js
const POLICY_FILE = path.join(__dirname, "..", "..", "policies", "yolo-allow-shell.toml");

spawnSync("gemini", [
  "--approval-mode", "yolo",
  "--policy", POLICY_FILE,      // <-- new
  "--model", model,
  "-p", ""
], { ... });
```

When `--policy <path>` is supplied, Gemini treats the path as a user-provided policy (user tier 4), which is higher than the bundled default policies (tier 1). The user policies directory (`~/.gemini/policies/`) is only used when `--policy` is **not** supplied, so passing `--policy` here does not suppress any global user policies — it adds to them.

---

## Alternative Approaches Considered

### `--allowed-tools run_shell_command` (deprecated, does not fix this)

The deprecated `--allowed-tools` flag creates an ALLOW rule, but the compiled rule has **no `argsPattern`**, so the heuristics gate still fires. This flag was removed in favour of the policy engine and does not suppress the dangerous-command check.

### Global `~/.gemini/policies/` policy

Placing the same TOML file in `~/.gemini/policies/` fixes the issue globally for all Gemini CLI invocations on the machine. This works correctly but is a wider blast radius than needed — the `--policy` approach scopes the override to this project's Gemini runner only.

### Sandbox mode (`--sandbox`)

When a sandbox is enabled, `shouldDowngradeForRedirection()` returns `false` in YOLO mode (sandbox + YOLO ⇒ no redirection downgrade). But the sandbox does not affect the `isDangerousCommand` heuristics, so `ASK_USER` is still forced for dangerous commands. This approach does not fix the root issue.

---

## Verifying the Fix

Run Gemini in headless YOLO mode against a command that would previously fail:

```bash
echo 'Remove the /tmp/test-artifact directory.' | gemini \
  --approval-mode yolo \
  --policy policies/yolo-allow-shell.toml \
  -p ""
```

Before the fix this exits non-zero with the confirmation error. After the fix it runs to completion.

---

## File Inventory

| File | Role |
|---|---|
| `policies/yolo-allow-shell.toml` | Policy rule that bypasses shell heuristics in YOLO headless mode |
| `agent-cli/runners/gemini.js` | Gemini runner — passes `--policy` on every invocation |

---

## References

- Gemini CLI policy engine source: `@google/gemini-cli/bundle/chunk-GDRLBWZL.js`
- Bundled policies directory: `@google/gemini-cli/bundle/policies/`
- Policy engine docs (online): `https://geminicli.com/docs/core/policy-engine`
