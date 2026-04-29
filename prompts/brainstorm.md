---
description: Analyze requirements for the interactive brainstorm phase — emit a complexity verdict, 3 design options, and grouped clarifying questions as strict JSON
---

{{SKILLS}}

Read the feature request below. Your task is to analyze it using the
`interactive-clarification` skill (`.spiq/skills/INTERACTIVE_CLARIFICATION.md`) and
produce a structured JSON payload.

You do NOT write a spec. You do NOT answer clarifying questions yourself. The orchestrator
will use your JSON to present options and questions to the user interactively in the
terminal.

## Feature Request

{{REQUEST}}

{{SKILL_CATALOG}}

## Instructions

1. Read `.spiq/skills/INTERACTIVE_CLARIFICATION.md` for the exact output schema,
   complexity rules, question rules, and candidate skill selection rules.
2. Assess complexity using the criteria in that skill file.
3. Identify the three most meaningfully different design approaches for this request.
4. If complexity is "complex": identify clarifying questions that would change the design
   if answered differently. Do not ask questions the requirements already answer.
5. Select `candidate_skills` from the Selectable Skills Catalog above. Choose only skills
   the task will directly exercise. Fewer is better — the plan agent refines this list.
6. Return ONLY the JSON object — no prose, no markdown fences, nothing else.

The output must be parseable by `JSON.parse()` with zero preprocessing.
