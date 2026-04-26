# Session Summary — 2026-04-26

## Overview

This session covered three areas: adding a PDF operations skill, diagnosing the build agent's excessive context size (~60K tokens), and implementing a fix that reduces the compiled build prompt by 96%.

---

## 1. PDF Skill

**Delivered:** `prompts/skills/PDF.md`

A new skill compatible with all three agents (Claude Code, OpenCode, Gemini CLI).

| Task | Tool |
|---|---|
| Create PDFs programmatically | `pdf-lib` (pure JS, `npm install pdf-lib`) |
| Extract text / metadata | `pdf-parse` (`npm install pdf-parse`) |
| Render HTML → PDF | `playwright` (already on `NODE_PATH`) |
| Merge / split / fill forms | `pdf-lib` |
| CLI fallback | `pdftotext`, `pandoc`, `ghostscript` |

The skill includes: programmatic creation, multi-stage Playwright rendering, CSS print tips, text extraction with page range support, merge/split/fill-form/watermark recipes, CLI fallbacks, and a verification checklist.

Also updated `prompts/skills/SKILLS.md` to add `pdf-operations` to the "Backend & Infrastructure Skills" section.

**Stage wiring:** PDF.md was already present in the `build` stage skill list in `promptCompiler.js`.

---

## 2. Context Size Investigation

**Problem:** Kimi-k2.5 inference log showed build agent calls ranging from 48,762 to 62,408 input tokens despite the workspace files (SPEC.md + plan.md + todo.md) totalling only ~5,000 tokens.

**Root cause identified:**

```
compileSkills(stage)
  └── load(file) × 13 files
        └── stripFrontmatter(content)  ← strips compact YAML metadata (851 tokens)
                                         and returns full body (27,468 tokens)
```

`compileSkills()` was calling `load()` on all 13 skill files and injecting their full bodies inline. `stripFrontmatter()` was discarding the compact frontmatter (name + description) and injecting the 27,468-token body — the exact inverse of the intended design.

Combined with OpenCode's fixed system + tool definition overhead (~20K tokens), this produced a ~48K token baseline before any workspace files were read.

**Measured impact:**

| | Before | After |
|---|---|---|
| Skills block in compiled prompt | ~27,468 tokens (13 bodies) | ~851 tokens (13 catalog lines) |
| Build stage compiled prompt | 110,733 chars (~27,683 tokens) | 4,528 chars (~1,132 tokens) |
| Projected build baseline | ~48,000 tokens | ~21,000 tokens |

---

## 3. Skill Context Inflation Fix

### Safety consideration

`stripFrontmatter()` was added specifically to prevent OpenCode/kimi from interpreting YAML `---name: test-driven-development---` blocks in compiled prompts as skill invocation directives (which caused `Error: Skill "test-driven-development" not found`). The fix preserves this safety invariant:

- The compiled prompt now contains a plain markdown catalog, not YAML. The invocation error cannot occur.
- Files written to `.spiq/skills/` pass through `stripFrontmatter()` before saving — agents reading on demand also see YAML-free content.

### `orchestrator/promptCompiler.js`

Added `parseFrontmatter(file)` — extracts `name` and `description` from the YAML block that `stripFrontmatter()` removes:

```js
function parseFrontmatter(file) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
  const match   = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const name = (match[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (match[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  return (name && desc) ? { name, desc, file } : null;
}
```

Rewrote `compileSkills(stage)` to emit a plain markdown catalog instead of full skill bodies:

```js
function compileSkills(stage) {
  const files   = STAGE_SKILLS[stage] || ["SKILLS.md"];
  const entries = files
    .map(f => parseFrontmatter(f))
    .filter(Boolean)
    .map(({ name, desc, file }) =>
      `- **${name}** (\`.spiq/skills/${file}\`) — ${desc}`
    );

  return [
    "## Available Skills",
    "",
    "The following skills provide detailed guidance. Read the relevant `.spiq/skills/` file before beginning each task:",
    "",
    entries.join("\n"),
  ].join("\n");
}
```

`load()` retained unchanged — still needed for `{{DEBUGGING}}` substitution in `failure.md` (Claude controller calls only).

Export updated: `module.exports = { compilePrompt, stripFrontmatter }` — `stripFrontmatter` exported so scaffold can import it.

### `utils/scaffold.js`

Added import and constant:
```js
const { stripFrontmatter } = require("../orchestrator/promptCompiler");
const SKILLS_SRC = path.join(__dirname, "..", "prompts", "skills");
```

Added `ensureSkills(workspace)` — copies all `.md` files from `prompts/skills/` to `{workspace}/.spiq/skills/`, stripping frontmatter before writing:

```js
function ensureSkills(workspace) {
  const dest = path.join(workspace, ".spiq", "skills");
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(SKILLS_SRC)) {
    if (!f.endsWith(".md")) continue;
    const raw   = fs.readFileSync(path.join(SKILLS_SRC, f), "utf-8");
    const clean = stripFrontmatter(raw);
    fs.writeFileSync(path.join(dest, f), clean);
  }
}
```

Updated `scaffold()` to call `ensureSkills(workspace)` after `ensureDirs()`.

### Verification

```
# Build stage prompt size after fix:
chars: 4528  ~tokens: 1132  (was 110,733 chars / ~27,683 tokens)

# Scaffold skill copy:
Skills copied: 22
Has YAML frontmatter: false
```

---

## Files Modified This Session

| File | Change |
|---|---|
| `prompts/skills/PDF.md` | New — PDF operations skill (pdf-lib, pdf-parse, playwright, CLI fallbacks) |
| `prompts/skills/SKILLS.md` | Added `pdf-operations` to skill index |
| `orchestrator/promptCompiler.js` | Added `parseFrontmatter()`; rewrote `compileSkills()` to emit catalog; exported `stripFrontmatter` |
| `utils/scaffold.js` | Added `ensureSkills()`; call from `scaffold()`; imported `stripFrontmatter` |
