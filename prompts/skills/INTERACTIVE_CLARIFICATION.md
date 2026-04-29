---
name: interactive-clarification
description: Analyze requirements and emit structured JSON for the interactive brainstorm phase. Produces a complexity verdict, exactly 3 design options with one recommended, and grouped clarifying questions. Used only in the brainstorm stage.
---

# Interactive Clarification

## Purpose

You are the first stage in the pipeline. Your job is to analyze the feature request and
produce a structured JSON payload. The orchestrator will use this payload to run an
interactive session with the user in the terminal — presenting your design options and
questions so the user can make explicit choices before the spec is written.

You do NOT write a spec. You do NOT answer clarifying questions yourself. You identify
what needs to be clarified and emit a machine-readable structure.

## Output Format

Return STRICT JSON only. No prose before the object. No prose after the object. No
markdown code fences. No explanation. The output must be parseable by `JSON.parse()`
with zero preprocessing.

Required shape:

```
{
  "complexity": "simple" | "complex",
  "complexity_rationale": "<one sentence explaining the verdict>",
  "candidate_skills": ["<SKILL_ID>", ...],
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
    { "id": 2, ..., "recommended": false },
    { "id": 3, ..., "recommended": false }
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
- No architectural fork points — only one reasonable approach exists given the constraints
- No conflicting constraints
- Scope is narrow and unambiguous

**Set `complexity = "complex"` when ANY of the following is true:**
- Tech stack not specified or only partially specified
- Multiple viable architectures exist (e.g., monolith vs microservices, REST vs GraphQL)
- Vague scope signals appear: "flexible", "scalable", "easy to use", "modern", "support multiple X"
- Missing or unmeasurable acceptance criteria
- Conflicting requirements detected
- Deployment environment not specified

When `complexity = "simple"`, set `question_groups` to `[]`.

## Design Options Rules

- Always produce exactly 3 options.
- Options must represent meaningfully different architectural or scope approaches — not
  trivial variations of the same approach.
- Exactly one option must have `"recommended": true`. Base the recommendation on what is
  most conservative, most maintainable, or best matched to stated constraints.
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

## Candidate Skills Rules

The `candidate_skills` field is an initial skill selection for the execution phase. The
plan agent will refine this list — you are giving a first approximation, not the final
word.

**Select a skill only when** the task will directly exercise it:
- Web pages / UI → WEB_DEV
- REST or HTTP endpoints → API_DESIGN
- Relational or document database → DATABASE
- Containerised deployment → DOCKER
- PDF files (generate, read, merge) → PDF
- Design token / theme system → THEME_FACTORY
- Static zero-dependency HTML deliverable → WEB_ARTIFACTS
- User-facing copy / microcopy → CONTENT_CREATION
- Browser DOM testing → BROWSER_TESTING
- HTTP API integration testing → API_TESTING
- Bug-fix task with existing test suite → REGRESSION_GUARD

**Do not select** skills the task will not touch. Prefer fewer over more — 3 is better
than 8. The plan agent will catch omissions; no one catches bloat.

## Anti-Patterns

- Do not wrap output in markdown fences (``` or ```json)
- Do not add prose before or after the JSON object
- Do not produce more than 3 design options
- Do not produce more than 8 questions
- Do not ask questions already answered in the requirements
- Do not make all options equivalent — they should represent real trade-offs
- Do not include every skill "just in case" — select only what the task will exercise
