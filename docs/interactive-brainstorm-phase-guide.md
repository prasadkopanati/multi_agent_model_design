# Interactive Brainstorm Phase — Implementation Guide

This guide covers the complete implementation of an interactive brainstorm stage added before `spec` in the pipeline. The stage surfaces clarifying questions and 3 design options to the user in the terminal, collects answers interactively, and passes confirmed decisions into the spec stage so SPEC.md reflects actual user intent rather than Claude's autonomous assumptions.

---

## Table of Contents

1. [Motivation](#motivation)
2. [Design Overview](#design-overview)
3. [Flow Diagram](#flow-diagram)
4. [JSON Schema (Claude's Output)](#json-schema-claudes-output)
5. [Complexity Detection Rules](#complexity-detection-rules)
6. [Terminal UX](#terminal-ux)
7. [File-by-File Changes](#file-by-file-changes)
   - [workspace-config.js](#1-orchestratorworkspace-configjs)
   - [INTERACTIVE_CLARIFICATION.md (new skill)](#2-promptsskillsinteractive_clarificationmd-new)
   - [promptCompiler.js](#3-orchestratorpromptcompilerjs)
   - [brainstorm.md (new prompt)](#4-promptsbrainstormmd-new)
   - [orchestrator.js](#5-orchestratororchestratorjs)
   - [spec.md](#6-promptsspecmd)
   - [plan.md](#7-promptsplanmd)
8. [Dynamic Skill Selection](#dynamic-skill-selection)
9. [Helper Function Reference](#helper-function-reference)
10. [Data Flow: Brainstorm → Spec](#data-flow-brainstorm--spec)
11. [Resume Handling](#resume-handling)
12. [Error Handling and Graceful Degradation](#error-handling-and-graceful-degradation)
13. [Implementation Order](#implementation-order)
14. [Testing Checklist](#testing-checklist)

---

## Motivation

The current `spec` stage runs Claude autonomously: it generates clarifying questions and then immediately answers them itself using conservative defaults. This works for well-specified requirements but produces specs that embed assumptions the user never agreed to, for two common cases:

- **Vague requirements** ("build a chat app", "add authentication") — critical architectural decisions are made silently
- **Ambiguous scope** ("should be flexible", "support multiple formats") — Claude picks one interpretation and runs with it

The fix is a genuine interactive clarification session before spec. The user picks their design direction and answers key questions; Claude writes the spec against those confirmed choices. Simple, fully-specified requirements skip the Q&A automatically.

---

## Design Overview

The brainstorm stage is a **two-pass** operation:

**Pass 1 — Claude runs non-interactively** (same as all other stages): reads `req.md`, emits a structured JSON payload describing complexity, 3 design options, and grouped clarifying questions with numbered sub-options and a recommended default for each.

**Pass 2 — Orchestrator runs interactively**: parses the JSON, renders the UI in the terminal, collects user input via `readline`, writes confirmed decisions to `.spiq/brainstorm.md`.

The brainstorm output is then passed to the spec stage via the `{{BRAINSTORM}}` placeholder, so Claude writes SPEC.md with the user's answers already baked in.

**Claude is never run interactively.** The `spawnSync` + captured JSON output model is preserved. All interactivity is handled by the orchestrator's `readline` calls — exactly the same pattern as `promptApproval()`.

---

## Flow Diagram

```
agenticspiq
    │
    └── runPipeline()
          │
          ├── [stage: brainstorm]  ──── isBrainstorm: true
          │     │
          │     ├── runStage("brainstorm")   ← Claude: req.md → JSON
          │     ├── readOutputArtifact()
          │     ├── extractText() + JSON.parse()
          │     ├── isValidBrainstormOutput()
          │     ├── renderDesignOptions()    ← always shown
          │     │
          │     ├── complexity === "simple"?
          │     │   ├── YES: skip Q&A, use recommended defaults, write brainstorm.md
          │     │   └── NO:
          │     │       ├── promptDesignSelection()   ← readline: pick 1/2/3
          │     │       └── promptQuestions()         ← readline: answer each Q
          │     │
          │     └── formatBrainstormMd() → write .spiq/brainstorm.md
          │           context.brainstorm = file contents
          │
          ├── [stage: spec]
          │     compilePrompt("spec", { brainstorm: "...", request: "...", ... })
          │         {{BRAINSTORM}} → brainstorm.md contents
          │         Claude writes SPEC.md with user decisions pre-resolved
          │
          └── [plan → build → test → review → finish]  (unchanged)
```

---

## JSON Schema (Claude's Output)

The brainstorm stage Claude run must emit **strict JSON only** — no prose, no markdown code fences, nothing before or after the object. The orchestrator calls `JSON.parse()` directly on the extracted text.

```json
{
  "complexity": "simple",
  "complexity_rationale": "Requirements specify a concrete tech stack, measurable acceptance criteria, and a single clear architectural approach.",
  "design_options": [
    {
      "id": 1,
      "title": "Express REST API + PostgreSQL",
      "summary": "A single Node.js server exposing REST endpoints backed by PostgreSQL. Standard, well-understood, easy to deploy and debug.",
      "tradeoffs": {
        "pros": [
          "Simple deployment — one process",
          "Strong tooling and community support",
          "Easy to reason about data consistency"
        ],
        "cons": [
          "Harder to scale individual components independently",
          "REST verbosity for complex queries"
        ]
      },
      "recommended": true
    },
    {
      "id": 2,
      "title": "GraphQL API + PostgreSQL",
      "summary": "GraphQL layer over the same PostgreSQL database. More flexible querying for clients at the cost of added complexity.",
      "tradeoffs": {
        "pros": ["Efficient data fetching", "Self-documenting schema"],
        "cons": ["Steeper learning curve", "More complex error handling", "N+1 query risk without DataLoader"]
      },
      "recommended": false
    },
    {
      "id": 3,
      "title": "Serverless Functions + DynamoDB",
      "summary": "AWS Lambda functions with DynamoDB. Pay-per-use, auto-scaling, but stateless by nature.",
      "tradeoffs": {
        "pros": ["Zero idle cost", "Auto-scaling"],
        "cons": ["Cold starts", "Vendor lock-in", "DynamoDB query patterns require schema design up front"]
      },
      "recommended": false
    }
  ],
  "question_groups": []
}
```

**When `complexity === "complex"`, `question_groups` is populated:**

```json
{
  "complexity": "complex",
  "complexity_rationale": "Tech stack is unspecified and two architectural approaches are equally viable.",
  "design_options": [ ... ],
  "question_groups": [
    {
      "category": "Tech Stack",
      "questions": [
        {
          "id": "q1",
          "text": "Which database should persist user data?",
          "options": [
            { "n": 1, "label": "PostgreSQL — relational, ACID, strong ecosystem", "recommended": true },
            { "n": 2, "label": "SQLite — zero-ops, single-file, great for small scale" },
            { "n": 3, "label": "MongoDB — document model, flexible schema" }
          ]
        }
      ]
    },
    {
      "category": "Authentication",
      "questions": [
        {
          "id": "q2",
          "text": "How should users authenticate?",
          "options": [
            { "n": 1, "label": "JWT tokens — stateless, easy to scale", "recommended": true },
            { "n": 2, "label": "Session-based — server-side state, simpler invalidation" },
            { "n": 3, "label": "OAuth (Google/GitHub) — delegates auth, no passwords to store" }
          ]
        }
      ]
    }
  ]
}
```

### Schema Invariants

| Field | Constraint |
|---|---|
| `complexity` | Must be `"simple"` or `"complex"` |
| `design_options` | Exactly 3 elements |
| `design_options[*].recommended` | Exactly one `true` across all 3 |
| `design_options[*].id` | 1, 2, 3 (matches display numbering) |
| `question_groups` | Empty array `[]` when `complexity === "simple"` |
| Questions total | Max 8 across all groups |
| `options` per question | 2–4 elements |
| `options[*].recommended` | Exactly one `true` per question |

---

## Complexity Detection Rules

Claude applies these rules when determining `complexity`. These rules also appear in `prompts/skills/INTERACTIVE_CLARIFICATION.md`.

**Set `complexity = "simple"` when ALL of the following are true:**
- Tech stack is explicitly named (framework, language, database, runtime)
- Acceptance criteria are concrete and measurable (not "fast", "easy", "modern")
- No architectural fork points — only one reasonable approach exists given the constraints
- No conflicting requirements
- Scope is narrow and unambiguous

**Set `complexity = "complex"` when ANY of the following is true:**
- Tech stack not specified or only partially specified
- Multiple viable architectures exist (e.g., monolith vs microservices, REST vs GraphQL)
- Vague scope signals appear: "flexible", "scalable", "easy to use", "modern", "support multiple X"
- Acceptance criteria missing or unmeasurable
- Conflicting constraints detected
- Deployment environment not specified

When `complexity === "simple"`, the orchestrator still renders the 3 design options (for the user's information) but skips the Q&A and proceeds immediately to spec with the recommended defaults.

---

## Terminal UX

### Simple Requirements (complexity = "simple")

```
▶ Running stage: brainstorm [claude]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BRAINSTORM — Requirements Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DESIGN OPTIONS

  [1] Express REST API + PostgreSQL   ★ RECOMMENDED
      A single Node.js server exposing REST endpoints backed by PostgreSQL.
      + Simple deployment — one process
      + Strong tooling and community support
      - Harder to scale individual components independently

  [2] GraphQL API + PostgreSQL
      GraphQL layer over the same PostgreSQL database.
      + Efficient data fetching
      - Steeper learning curve

  [3] Serverless Functions + DynamoDB
      AWS Lambda functions with DynamoDB.
      + Zero idle cost
      - Cold starts

Complexity assessment: SIMPLE
Requirements specify a concrete tech stack, measurable acceptance criteria, and a single clear architectural approach.
Skipping interactive Q&A. Proceeding to spec with recommended defaults.

 Brainstorm saved → /path/to/workspace/.spiq/brainstorm.md

▶ Running stage: spec [claude]
```

### Complex Requirements (complexity = "complex")

```
▶ Running stage: brainstorm [claude]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BRAINSTORM — Requirements Clarification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DESIGN OPTIONS

  [1] Express REST API + PostgreSQL   ★ RECOMMENDED
      A single Node.js server exposing REST endpoints backed by PostgreSQL.
      + Simple deployment — one process
      + Strong tooling and community support
      - Harder to scale individual components independently

  [2] GraphQL API + PostgreSQL
      GraphQL layer over the same PostgreSQL database.
      + Efficient data fetching
      - Steeper learning curve

  [3] Serverless Functions + DynamoDB
      AWS Lambda functions with DynamoDB.
      + Zero idle cost
      - Cold starts

Which design do you prefer? [1/2/3, Enter=1 (recommended)]: 

CLARIFYING QUESTIONS

Tech Stack
  Q1: Which database should persist user data?
      [1] PostgreSQL — relational, ACID, strong ecosystem (recommended)
      [2] SQLite — zero-ops, single-file, great for small scale
      [3] MongoDB — document model, flexible schema
  Answer [Enter=1]: 

Authentication
  Q2: How should users authenticate?
      [1] JWT tokens — stateless, easy to scale (recommended)
      [2] Session-based — server-side state, simpler invalidation
      [3] OAuth (Google/GitHub) — delegates auth, no passwords to store
  Answer [Enter=1]: 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Brainstorm saved → /path/to/workspace/.spiq/brainstorm.md

▶ Running stage: spec [claude]
```

**Input behavior:**
- Pressing Enter selects the recommended option (the one with `"recommended": true`)
- Entering a valid integer (e.g., `2`) selects that option
- Entering an invalid value: re-prompt once, then fall back to the recommended default

---

## File-by-File Changes

### 1. `orchestrator/workspace-config.js`

Add `brainstormFile` to the config object. This is a pure additive change.

**Before:**
```js
function makeWorkspaceConfig(workspace) {
  const stateDir = path.join(workspace, ".spiq");
  return {
    workspace,
    stateDir,
    compiledDir: path.join(stateDir, "artifacts", "compiled"),
    outputDir:   path.join(stateDir, "artifacts", "output"),
    failuresDir: path.join(stateDir, "artifacts", "failures"),
    tasksFile:   path.join(stateDir, "tasks.json"),
    reqFile:     path.join(stateDir, "req.md"),
    specFile:    path.join(stateDir, "SPEC.md"),
    planFile:    path.join(stateDir, "tasks", "plan.md"),
    planDir:     path.join(stateDir, "tasks"),
  };
}
```

**After:**
```js
function makeWorkspaceConfig(workspace) {
  const stateDir = path.join(workspace, ".spiq");
  return {
    workspace,
    stateDir,
    compiledDir:    path.join(stateDir, "artifacts", "compiled"),
    outputDir:      path.join(stateDir, "artifacts", "output"),
    failuresDir:    path.join(stateDir, "artifacts", "failures"),
    tasksFile:      path.join(stateDir, "tasks.json"),
    reqFile:        path.join(stateDir, "req.md"),
    brainstormFile: path.join(stateDir, "brainstorm.md"),    // ← added
    specFile:       path.join(stateDir, "SPEC.md"),
    planFile:       path.join(stateDir, "tasks", "plan.md"),
    planDir:        path.join(stateDir, "tasks"),
  };
}
```

---

### 2. `prompts/skills/INTERACTIVE_CLARIFICATION.md` (new)

Create this file. It is referenced by `STAGE_SKILLS.brainstorm` in `promptCompiler.js` and copied to `.spiq/skills/` by `scaffold.js` on first run.

```md
---
name: interactive-clarification
description: Analyze requirements and emit structured JSON for the interactive brainstorm phase. Produces a complexity verdict, exactly 3 design options with one recommended, and grouped clarifying questions. Used only in the brainstorm stage.
---

# Interactive Clarification

## Purpose

You are the first stage in the pipeline. Your job is to analyze the feature request in
`req.md` and produce a structured JSON payload. The orchestrator will use this payload
to run an interactive session with the user in the terminal — presenting your design
options and questions so the user can make explicit choices before the spec is written.

You do NOT write a spec. You do NOT answer clarifying questions yourself. You identify
what needs to be clarified and emit a machine-readable structure.

## Output Format

Return STRICT JSON only. No prose before the object. No prose after the object. No
markdown code fences. No explanation. The output must be parseable by `JSON.parse()`
with zero preprocessing.

Required shape:

```json
{
  "complexity": "simple" | "complex",
  "complexity_rationale": "<one sentence explaining the verdict>",
  "design_options": [
    {
      "id": 1,
      "title": "<title — 8 words or fewer>",
      "summary": "<2–3 sentence description>",
      "tradeoffs": {
        "pros": ["<string>", "<string>"],
        "cons": ["<string>", "<string>"]
      },
      "recommended": true
    },
    { "id": 2, "...", "recommended": false },
    { "id": 3, "...", "recommended": false }
  ],
  "question_groups": [
    {
      "category": "<category name>",
      "questions": [
        {
          "id": "q1",
          "text": "<the question>",
          "options": [
            { "n": 1, "label": "<label>", "recommended": true },
            { "n": 2, "label": "<label>" }
          ]
        }
      ]
    }
  ]
}
```

## Complexity Rules

**Set `complexity = "simple"` when ALL of the following are true:**
- Tech stack is explicitly named (framework, language, database, runtime)
- Acceptance criteria are concrete and measurable
- No architectural fork points — only one reasonable approach exists
- No conflicting constraints
- Scope is narrow and unambiguous

**Set `complexity = "complex"` when ANY of the following is true:**
- Tech stack not specified or only partially specified
- Multiple viable architectures exist
- Vague scope signals: "flexible", "scalable", "easy to use", "modern"
- Missing or unmeasurable acceptance criteria
- Conflicting constraints detected

When `complexity = "simple"`, set `question_groups` to `[]`.

## Design Options Rules

- Always produce exactly 3 options.
- Options must represent meaningfully different architectural or scope approaches — not
  trivial variations of the same approach.
- Exactly one option must have `"recommended": true`. Base the recommendation on what is
  most conservative, most maintainable, or best matched to the stated constraints.
- Do not include strawman options. Every option must be genuinely viable.
- Title must be 8 words or fewer and convey the core technology choice.

## Question Rules

- Only produce questions for ambiguities that would change the design if answered
  differently. Do not ask questions whose answers are already in the requirements.
- Group by category: Tech Stack, Users & Context, Scope & Behavior, Scale & Performance,
  Security & Auth.
- Maximum 8 questions total across all groups.
- Each question has 2–4 options. Exactly one option per question must have
  `"recommended": true`.
- Labels should be concise and include the key trade-off signal (e.g., "PostgreSQL —
  relational, ACID, strong ecosystem" not just "PostgreSQL").

## Anti-Patterns

- Do not wrap output in markdown fences (``` or ```json)
- Do not add prose before or after the JSON object
- Do not produce more than 3 design options
- Do not produce more than 8 questions
- Do not ask questions already answered in the requirements
- Do not make all options equivalent — they should represent real trade-offs
```

---

### 3. `orchestrator/promptCompiler.js`

Two additions: register `brainstorm` in `STAGE_SKILLS` and handle the `{{BRAINSTORM}}` placeholder.

**In `STAGE_SKILLS`, add:**
```js
const STAGE_SKILLS = {
  brainstorm: ["SKILLS.md", "INTERACTIVE_CLARIFICATION.md"],   // ← added
  spec:    ["SKILLS.md", "SPEC_CEO_CHALLENGE.md", "SPEC_DRIVEN.md", "BRAINSTORMING.md"],
  plan:    ["SKILLS.md", "PLANNING.md", "TEST_DRIVEN.md", "PLAN_QUALITY_GATE.md", "DISPATCHING_PARALLEL_AGENTS.md"],
  build:   [ ... ],
  test:    [ ... ],
  review:  [ ... ],
  finish:  [ ... ],
  failure: [ ... ],
};
```

**In `compilePrompt`, add one `replaceAll` line** (alongside the existing replacements):
```js
function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(path.join(PROMPTS_DIR, `${stage}.md`), "utf-8");

  template = template.replaceAll("{{SKILLS}}",      compileSkills(stage));
  template = template.replaceAll("{{DEBUGGING}}",   load("DEBUGGING.md"));
  template = template.replaceAll("{{REQUEST}}",     context.request    || "");
  template = template.replaceAll("{{BRAINSTORM}}",  context.brainstorm || "");  // ← added
  template = template.replaceAll("{{FAILURE}}",     context.failure    || "");
  template = template.replaceAll("{{ANALYSIS}}",    context.analysis ? JSON.stringify(context.analysis, null, 2) : "");
  template = template.replaceAll("{{PLAN}}",        context.plan       || "");
  template = template.replaceAll("{{SPEC}}",        context.spec       || "");
  template = template.replaceAll("{{BUILD}}",       context.build      || "");
  template = template.replaceAll("{{TEST}}",        context.test       || "");
  template = template.replaceAll("{{REVIEW}}",      context.review     || "");
  template = template.replaceAll("{{SPEC_FILE}}",   context.specFile   || "SPEC.md");
  template = template.replaceAll("{{PLAN_FILE}}",   context.planFile   || "tasks/plan.md");
  template = template.replaceAll("{{PLAN_DIR}}",    context.planDir    || "tasks");

  return template;
}
```

When `context.brainstorm` is empty (brainstorm was skipped or failed), `{{BRAINSTORM}}` resolves to an empty string and `spec.md` behaves exactly as it does today.

---

### 4. `prompts/brainstorm.md` (new)

Create this file. This is the Claude prompt template for the brainstorm stage.

```md
---
description: Analyze requirements for the interactive brainstorm phase — emit a complexity verdict, 3 design options, and grouped clarifying questions as strict JSON
---

{{SKILLS}}

Read the feature request below. Your task is to analyze it using the
`interactive-clarification` skill (`.spiq/skills/INTERACTIVE_CLARIFICATION.md`) and
produce a structured JSON payload.

You do NOT write a spec. You do NOT answer clarifying questions yourself. The orchestrator
will use your JSON to present options and questions to the user interactively.

## Feature Request

{{REQUEST}}

## Instructions

1. Read `.spiq/skills/INTERACTIVE_CLARIFICATION.md` for the exact output schema, complexity
   rules, and question rules.
2. Assess complexity using the criteria in that skill file.
3. Identify the three most meaningfully different design approaches.
4. If complexity is "complex": identify clarifying questions that would change the design
   if answered differently.
5. Return ONLY the JSON object — no prose, no markdown fences, nothing else.

The output must be parseable by `JSON.parse()` with zero preprocessing.
```

---

### 5. `orchestrator/orchestrator.js`

This is the largest change. Four modifications are required.

#### 5a. Add `brainstorm` to `DEFAULT_AGENTS`

```js
const DEFAULT_AGENTS = {
  brainstorm: "claude",    // ← added
  spec:    "claude",
  plan:    "claude",
  review:  "claude",
  finish:  "gemini",
  failure: "claude",
  build:   "opencode",
  test:    "opencode",
};
```

#### 5b. Add `brainstorm` to `PIPELINE`

The new entry is prepended with `isBrainstorm: true` — a flag the main loop uses to dispatch to `runBrainstormStage()` instead of the standard `runStage()`.

```js
const PIPELINE = [
  { stage: "brainstorm", contextKey: "brainstorm", requiresApproval: false, isBrainstorm: true },
  { stage: "spec",       contextKey: "spec",        requiresApproval: true  },
  { stage: "plan",       contextKey: "plan",        requiresApproval: true  },
  { stage: "build",      contextKey: "build",       requiresApproval: false },
  { stage: "test",       contextKey: "test",        requiresApproval: false },
  { stage: "review",     contextKey: "review",      requiresApproval: false },
  { stage: "finish",     contextKey: null,           requiresApproval: false },
];
```

#### 5c. Add helper functions

Add the following functions between `writePlanArtifacts` and the `PIPELINE` definition:

```js
// ─── Brainstorm helpers ───────────────────────────────────────────────────────

function isValidBrainstormOutput(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!["simple", "complex"].includes(obj.complexity)) return false;
  if (!Array.isArray(obj.design_options) || obj.design_options.length !== 3) return false;
  if (obj.design_options.filter(o => o.recommended === true).length !== 1) return false;
  if (!Array.isArray(obj.question_groups)) return false;
  return true;
}

function renderDesignOptions(options) {
  const SEP = "━".repeat(54);
  console.log("\n" + SEP);
  console.log("  BRAINSTORM — Requirements Clarification");
  console.log(SEP + "\n");
  console.log("DESIGN OPTIONS\n");
  for (const opt of options) {
    const tag = opt.recommended ? "   ★ RECOMMENDED" : "";
    console.log(`  [${opt.id}] ${opt.title}${tag}`);
    if (opt.summary) console.log(`      ${opt.summary}`);
    (opt.tradeoffs?.pros || []).forEach(p => console.log(`      + ${p}`));
    (opt.tradeoffs?.cons || []).forEach(c => console.log(`      - ${c}`));
    console.log();
  }
}

async function promptDesignSelection(options) {
  const recommended = options.find(o => o.recommended) || options[0];
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `Which design do you prefer? [1/2/3, Enter=${recommended.id} (recommended)]: `,
      (answer) => {
        rl.close();
        const n = parseInt(answer.trim(), 10);
        const selected = options.find(o => o.id === n) || recommended;
        resolve(selected);
      }
    );
  });
}

async function promptSingleQuestion(q) {
  const recommended = q.options.find(o => o.recommended) || q.options[0];
  console.log(`  ${q.text}`);
  q.options.forEach(o => {
    const tag = o.recommended ? " (recommended)" : "";
    console.log(`      [${o.n}] ${o.label}${tag}`);
  });

  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  Answer [Enter=${recommended.n}]: `, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });

  let n = parseInt(answer, 10);
  if (!answer || !q.options.find(o => o.n === n)) {
    if (answer) {
      // Invalid — re-prompt once
      const retry = await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`  Invalid. Answer [Enter=${recommended.n}]: `, (a) => {
          rl.close();
          resolve(a.trim());
        });
      });
      n = parseInt(retry, 10);
    }
  }

  const chosen = q.options.find(o => o.n === n) || recommended;
  return { questionId: q.id, question: q.text, chosen: chosen.label };
}

async function promptQuestions(questionGroups) {
  const results = [];
  for (const group of questionGroups) {
    console.log(`\n${group.category}`);
    for (const q of group.questions) {
      const answer = await promptSingleQuestion(q);
      results.push(answer);
    }
  }
  return results;
}

function formatBrainstormMd(data, selectedOption, answers) {
  const lines = [
    "# Brainstorm Session",
    "",
    "## Complexity Assessment",
    "",
    `**Verdict:** ${data.complexity.toUpperCase()}`,
    `**Rationale:** ${data.complexity_rationale}`,
    "",
    "## Selected Design Option",
    "",
    `**[${selectedOption.id}] ${selectedOption.title}**`,
    "",
    selectedOption.summary || "",
    "",
  ];

  if (selectedOption.tradeoffs?.pros?.length || selectedOption.tradeoffs?.cons?.length) {
    lines.push("**Trade-offs:**", "");
    (selectedOption.tradeoffs?.pros || []).forEach(p => lines.push(`- ✓ ${p}`));
    (selectedOption.tradeoffs?.cons || []).forEach(c => lines.push(`- ✗ ${c}`));
    lines.push("");
  }

  if (answers.length > 0) {
    lines.push("## Clarifying Questions — User Answers", "");
    for (const a of answers) {
      lines.push(`**${a.question}**`);
      lines.push(`→ ${a.chosen}`, "");
    }
  } else {
    lines.push("## Clarifying Questions", "");
    lines.push("_Skipped — requirements were assessed as clear and complete. Recommended defaults apply._", "");
  }

  lines.push("---");
  lines.push("_These decisions are confirmed by the user. The spec stage must not re-open them._");

  return lines.join("\n");
}

async function runBrainstormStage(workspace, context, cfg) {
  // Pass 1: Claude reads req.md and emits structured JSON
  runStage("brainstorm", workspace, context, cfg);

  const rawOutput = readOutputArtifact("brainstorm", cfg);
  if (!rawOutput) {
    console.warn("⚠  Brainstorm output not found — proceeding to spec without brainstorm.");
    return null;
  }

  let brainstormData;
  try {
    const text = extractText(rawOutput);
    // Strip markdown code fences if present (defensive)
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    brainstormData = JSON.parse(cleaned);
  } catch {
    console.warn("⚠  Brainstorm output was not valid JSON — proceeding to spec without brainstorm.");
    return null;
  }

  if (!isValidBrainstormOutput(brainstormData)) {
    console.warn("⚠  Brainstorm JSON schema invalid — proceeding to spec without brainstorm.");
    return null;
  }

  // Always render design options
  renderDesignOptions(brainstormData.design_options);

  let selectedOption, answers;

  if (brainstormData.complexity === "simple") {
    console.log(`Complexity assessment: SIMPLE`);
    console.log(`${brainstormData.complexity_rationale}`);
    console.log("Skipping interactive Q&A. Proceeding to spec with recommended defaults.\n");
    selectedOption = brainstormData.design_options.find(o => o.recommended) || brainstormData.design_options[0];
    answers = [];
  } else {
    // Pass 2a: Design selection
    selectedOption = await promptDesignSelection(brainstormData.design_options);

    // Pass 2b: Clarifying questions
    answers = await promptQuestions(brainstormData.question_groups);
  }

  // Write .spiq/brainstorm.md
  const brainstormMd = formatBrainstormMd(brainstormData, selectedOption, answers);
  fs.writeFileSync(cfg.brainstormFile, brainstormMd);

  const SEP = "━".repeat(54);
  console.log("\n" + SEP);
  console.log(` Brainstorm saved → ${cfg.brainstormFile}`);
  console.log(SEP + "\n");

  return brainstormMd;
}
```

#### 5d. Update `runPipeline`

Two changes: the preload loop and the main loop.

**Preload loop** (for resume — reads `brainstorm.md` directly instead of from JSON artifact):

```js
// Pre-load context from persisted artifacts for stages that already completed
let context = { request, specFile: cfg.specFile, planFile: cfg.planFile, planDir: cfg.planDir };
for (let i = 0; i < startIdx; i++) {
  const { stage, contextKey, isBrainstorm } = PIPELINE[i];

  if (isBrainstorm) {
    // brainstorm.md is written directly (not a JSON artifact) — read it from file
    if (fs.existsSync(cfg.brainstormFile)) {
      context = { ...context, brainstorm: fs.readFileSync(cfg.brainstormFile, "utf-8") };
    }
    continue;
  }

  if (contextKey) {
    const output = readOutputArtifact(stage, cfg);
    if (output) context = { ...context, [contextKey]: output };
  }
}
```

**Main loop** (dispatch to `runBrainstormStage` for brainstorm, unchanged for all other stages):

```js
for (let i = startIdx; i < PIPELINE.length; i++) {
  const { stage, contextKey, requiresApproval, isBrainstorm } = PIPELINE[i];
  updateCurrentStage(stage, cfg);

  if (isBrainstorm) {
    const brainstormMd = await runBrainstormStage(workspace, context, cfg);
    if (brainstormMd) {
      context = { ...context, brainstorm: brainstormMd };
    }
    continue;  // no approval prompt; flows directly to spec
  }

  runStage(stage, workspace, context, cfg);

  const output = readOutputArtifact(stage, cfg);
  if (output) {
    if (stage === "plan")   writePlanArtifacts(cfg, output);
    if (stage === "review") printReviewSummary(output);
    if (contextKey) context = { ...context, [contextKey]: output };
  }

  if (stage === "review" && !isReviewPass(output)) {
    console.log("⛔ Review verdict is FAIL. Pipeline stopped. Fix issues and re-run from the build stage.");
    updateCurrentStage("build", cfg);
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    task.human_required = true;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
    process.exit(1);
  }

  if (requiresApproval) {
    const approved = await promptApproval(stage, cfg);
    if (!approved) {
      console.log(`⛔ Pipeline stopped at ${stage}. Edit .spiq/req.md and re-run.`);
      process.exit(0);
    }
  }
}
```

---

### 6. `prompts/spec.md`

Two changes: inject `{{BRAINSTORM}}` and update Step 1 to acknowledge confirmed answers.

**After `{{REQUEST}}` and before Step 0**, add the brainstorm block:

```md
{{SKILLS}}

The user's feature request is provided below:

{{REQUEST}}

{{BRAINSTORM}}

**Step 0 — Challenge the framing**
...
```

**Update Step 1** to treat brainstorm answers as resolved decisions:

```md
**Step 1 — Brainstorm and surface ambiguities**

If the brainstorm section above is populated, the user has already answered the key
clarifying questions interactively. **Treat those answers as confirmed decisions — do
not re-open them.** Focus this step only on gaps not already covered by the brainstorm
session (edge cases, implementation details, error handling specifics).

If no brainstorm section is present, proceed fully autonomously as normal: work through
all clarifying questions yourself and produce an ASSUMPTION REGISTER.

Read `.spiq/skills/BRAINSTORMING.md` and apply it to any remaining ambiguities.
```

---

## Dynamic Skill Selection

The skill system splits skills into two tiers:

**Base skills** — always loaded for a stage, not selectable. These are the core process skills every run needs:
- build: `INCREMENTAL_IMPLEMENTATION`, `TEST_DRIVEN`, `DEBUGGING`, `WIP_CHECKPOINT`, `GIT`, `REQUESTING_CODE_REVIEW`, `EXECUTION_DISCIPLINE`, `BUILD_HANDOFF_SUMMARY`
- test: `TEST_DRIVEN`, `VERIFICATION_BEFORE_COMPLETION`, `WIP_CHECKPOINT`, `BUILD_HANDOFF_SUMMARY`
- review, finish, spec, plan, failure: all skills remain fixed (never dynamically selected)

**Selectable skills** — task-type skills loaded only when explicitly selected:

| ID | Stages | Use when |
|---|---|---|
| `WEB_DEV` | build, test | HTML/CSS/JS, browser UI |
| `API_DESIGN` | build, review | REST endpoints, HTTP contracts |
| `DATABASE` | build | Schema, migrations, queries |
| `DOCKER` | build | Dockerfiles, containerisation |
| `PDF` | build | PDF generation, extraction |
| `THEME_FACTORY` | build | Design tokens, CSS themes |
| `WEB_ARTIFACTS` | build, test | Static HTML, zero-dependency frontend |
| `CONTENT_CREATION` | build | UI copy, microcopy |
| `BROWSER_TESTING` | test | DOM, DevTools-based testing |
| `API_TESTING` | test | HTTP integration tests |
| `REGRESSION_GUARD` | test | Bug-fix regression tests |

### Selection flow

```
Brainstorm JSON: candidate_skills: ["WEB_DEV", "API_DESIGN"]
    ↓ context.brainstormSkills (formatted text)
Spec: reviews candidates, adds ## Selected Skills section
    ↓ (informational in SPEC.md)
Plan: finalises list, outputs SELECTED_SKILLS: ["WEB_DEV", "API_DESIGN"]
    ↓ orchestrator extracts via regex, saves to tasks.json
Build: compileSkills("build", ["WEB_DEV", "API_DESIGN"])
    → base skills + WEB_DEV.md + API_DESIGN.md (only these two, not all 11 selectable)
Test: compileSkills("test", ["WEB_DEV", "API_DESIGN"])
    → base skills + WEB_DEV.md (API_DESIGN not in test stage)
```

### What the plan agent outputs

```
SELECTED_SKILLS: ["WEB_DEV", "API_DESIGN", "DATABASE"]

PLAN QUALITY GATE RESULT
...
```

The `SELECTED_SKILLS:` line must be first in plan.md — the orchestrator matches `/^SELECTED_SKILLS:\s*(.+)$/m`.

### Graceful degradation

If no `SELECTED_SKILLS:` line is found in plan output, build/test run with base skills only and a warning is printed. The pipeline never fails over a missing skill selection.

---

## Helper Function Reference

| Function | Location | Purpose |
|---|---|---|
| `isValidBrainstormOutput(obj)` | orchestrator.js | Validate JSON schema before using |
| `renderDesignOptions(options)` | orchestrator.js | Print the 3 options with trade-offs |
| `promptDesignSelection(options)` | orchestrator.js | readline: pick a design option |
| `promptSingleQuestion(q)` | orchestrator.js | readline: answer one clarifying question |
| `promptQuestions(questionGroups)` | orchestrator.js | Loop over all question groups |
| `formatBrainstormMd(data, opt, answers)` | orchestrator.js | Format `.spiq/brainstorm.md` |
| `runBrainstormStage(workspace, ctx, cfg)` | orchestrator.js | Orchestrate the full two-pass flow |

---

## Data Flow: Brainstorm → Spec

```
req.md
  │
  └── compilePrompt("brainstorm", { request: "..." })
        → prompts/brainstorm.md compiled with {{REQUEST}}
        → written to .spiq/artifacts/compiled/brainstorm.md
        → Claude reads it, returns JSON
        → written to .spiq/artifacts/output/brainstorm.json

runBrainstormStage()
  │
  ├── readOutputArtifact("brainstorm") → raw JSON string
  ├── extractText() + JSON.parse() → brainstormData object
  ├── user selects design option and answers questions
  └── formatBrainstormMd() → write .spiq/brainstorm.md

context.brainstorm = fs.readFileSync(cfg.brainstormFile)

compilePrompt("spec", { brainstorm: "# Brainstorm Session\n...", request: "...", ... })
  │
  ├── {{BRAINSTORM}} replaced with full brainstorm.md contents
  └── Claude sees:
        - the original request
        - the selected design option
        - confirmed answers to clarifying questions
        → writes SPEC.md without re-opening decided questions
```

**What `.spiq/brainstorm.md` looks like:**

```md
# Brainstorm Session

## Complexity Assessment

**Verdict:** COMPLEX
**Rationale:** Tech stack is unspecified and two architectural approaches are equally viable.

## Selected Design Option

**[1] Express REST API + PostgreSQL**

A single Node.js server exposing REST endpoints backed by PostgreSQL.

**Trade-offs:**
- ✓ Simple deployment — one process
- ✓ Strong tooling and community support
- ✗ Harder to scale individual components independently

## Clarifying Questions — User Answers

**Which database should persist user data?**
→ PostgreSQL — relational, ACID, strong ecosystem

**How should users authenticate?**
→ Session-based — server-side state, simpler invalidation

---
_These decisions are confirmed by the user. The spec stage must not re-open them._
```

---

## Resume Handling

The brainstorm stage is handled specially in the preload loop because its output (`brainstorm.md`) is not a JSON artifact like other stages.

**When pipeline resumes from `spec` or later:**

```js
for (let i = 0; i < startIdx; i++) {
  const { isBrainstorm } = PIPELINE[i];
  if (isBrainstorm) {
    if (fs.existsSync(cfg.brainstormFile)) {
      context = { ...context, brainstorm: fs.readFileSync(cfg.brainstormFile, "utf-8") };
    }
    continue;
  }
  // ...normal artifact load
}
```

`brainstorm.md` is written once and never overwritten on resume. If the file exists, the spec stage always receives the brainstorm context. If it doesn't (e.g., brainstorm was skipped or failed on the first run), spec runs autonomously — same as today.

**Pipeline state in `tasks.json` during brainstorm:**
```json
{ "current_stage": "brainstorm" }
```

If the process is killed mid-brainstorm (e.g., during the user Q&A), re-running will restart the brainstorm stage. The brainstorm JSON artifact may or may not exist. If it exists, the orchestrator skips the Claude call and goes straight to user interaction (this requires the output artifact read to happen before calling `runStage` — see the full implementation note below).

> **Note:** For true mid-Q&A resume, you would need to check whether `.spiq/artifacts/output/brainstorm.json` already exists before calling `runStage`. This is a simple optimization: `if (!fs.existsSync(outputFile)) runStage(...)`. Add this to `runBrainstormStage` if users frequently interrupt mid-session.

---

## Error Handling and Graceful Degradation

The brainstorm stage never blocks the pipeline. Every failure path falls through to autonomous spec:

| Failure mode | Cause | Behavior |
|---|---|---|
| `readOutputArtifact` returns null | Claude failed, timed out, or agent-cli exited non-zero | Warn + return null; spec runs autonomously |
| `JSON.parse` throws | Claude emitted prose or code fence despite prompt | Strip code fence, re-parse; if still fails: warn + return null |
| Schema validation fails | Wrong number of options, missing fields, etc. | Warn + return null; spec runs autonomously |
| User sends EOF (Ctrl+D) during readline | Terminal closed | readline resolves with empty string → recommended default selected |

```
Brainstorm fails for any reason
    ↓
runBrainstormStage() returns null
    ↓
context.brainstorm stays undefined
    ↓
compilePrompt("spec") → {{BRAINSTORM}} → ""
    ↓
spec.md Step 1: "no brainstorm section present — proceed autonomously"
    ↓
SPEC.md written with Claude's conservative assumptions (current behavior)
```

---

## Implementation Order

Apply changes in this sequence to keep the codebase in a working state at every step:

1. **`orchestrator/workspace-config.js`** — Add `brainstormFile`. Zero risk; nothing reads it yet.

2. **`prompts/skills/INTERACTIVE_CLARIFICATION.md`** — Create the skill file. Must exist before `promptCompiler.js` tries to load it.

3. **`orchestrator/promptCompiler.js`** — Add `brainstorm` to `STAGE_SKILLS` and `{{BRAINSTORM}}` replacement. The `STAGE_SKILLS` change only takes effect when the `brainstorm` stage prompt template exists, so no error until step 4.

4. **`prompts/brainstorm.md`** — Create the brainstorm prompt template. The compiler can now compile this stage.

5. **`orchestrator/orchestrator.js`** — Add all helper functions, then update `PIPELINE` and `runPipeline`. Adding `brainstorm` to `PIPELINE` before the prompt template exists would cause the stage to fail immediately on the first run — so this step must come after step 4.

6. **`prompts/spec.md`** — Add `{{BRAINSTORM}}` and update Step 1. This is safe at any point because `{{BRAINSTORM}}` resolves to empty string when context is empty.

---

## Testing Checklist

Run these scenarios manually after implementation:

- [ ] **Vague requirements** (`req.md` says "build a chat app"): brainstorm should trigger, show complexity = "complex", display 3 options and Q&A
- [ ] **Specific requirements** (tech stack + acceptance criteria fully specified): brainstorm should show complexity = "simple", display options but skip Q&A
- [ ] **Enter key for all inputs**: all recommended defaults selected; `brainstorm.md` shows all recommended answers
- [ ] **Non-default selections** (e.g., pick option 2 for design, option 3 for a question): `brainstorm.md` reflects the user's actual choices
- [ ] **Invalid input** (type "abc" for a question): re-prompt once, then fall back to recommended
- [ ] **Resume from spec**: kill process during Q&A, re-run; pipeline should resume at brainstorm and redo the Q&A (or, with the optimization: resume and skip the Claude call if JSON artifact already exists)
- [ ] **Claude output corruption** (manually break `.spiq/artifacts/output/brainstorm.json`): warning should print and spec should run autonomously
- [ ] **`{{BRAINSTORM}}` in compiled spec**: inspect `.spiq/artifacts/compiled/spec.md` — should contain the brainstorm session markdown when brainstorm ran
- [ ] **`AGENT_BRAINSTORM=opencode` env var**: verify `getAgentForStage("brainstorm")` returns "opencode" (env override works for the new stage)

### Unit test additions (`tests/promptCompiler.test.js`)

```js
test("replaces {{BRAINSTORM}} with brainstorm context", () => {
  const result = compilePrompt("spec", {
    brainstorm: "# Brainstorm Session\n\n## Selected Design Option\n\n**[1] Express**"
  });
  assert.ok(result.includes("# Brainstorm Session"));
  assert.ok(!result.includes("{{BRAINSTORM}}"));
});

test("replaces {{BRAINSTORM}} with empty string when not in context", () => {
  const result = compilePrompt("spec", {});
  assert.ok(!result.includes("{{BRAINSTORM}}"));
});
```

New test file (`tests/brainstorm.test.js`):

```js
const { isValidBrainstormOutput, formatBrainstormMd } = require("../orchestrator/orchestrator");

// isValidBrainstormOutput
test("returns true for valid simple output", () => { ... });
test("returns false if design_options.length !== 3", () => { ... });
test("returns false if no recommended option", () => { ... });
test("returns false if two recommended options", () => { ... });
test("returns false for unknown complexity value", () => { ... });

// formatBrainstormMd
test("formats simple run (no answers) correctly", () => { ... });
test("formats complex run with answers correctly", () => { ... });
test("includes closing note about confirmed decisions", () => { ... });
```
