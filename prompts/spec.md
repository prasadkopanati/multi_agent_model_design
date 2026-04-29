---
description: Start spec-driven development — clarify requirements, then write a structured specification before writing code
---

{{SKILLS}}

The user's feature request is provided below:

{{REQUEST}}

{{BRAINSTORM}}

**Step 0 — Challenge the framing**

Read `.spiq/skills/SPEC_CEO_CHALLENGE.md` and apply all five forcing questions to the request above before doing anything else. Record each answer explicitly. Add the `CHALLENGED PREMISES` section to the Assumption Register you will produce in Step 1.

This step costs one pass of reasoning before any spec is written. The alternative — discovering a misframed request at the review stage — costs a full pipeline cycle.

**Step 1 — Brainstorm and surface ambiguities**

If the brainstorm section above is populated, the user has already answered the key clarifying questions interactively. **Treat those answers as confirmed decisions — do not re-open them.** Focus this step only on gaps not already covered (edge cases, implementation details, error handling specifics not addressed in the brainstorm session).

If no brainstorm section is present, proceed fully autonomously as normal.

Read `.spiq/skills/BRAINSTORMING.md` and apply it to any remaining ambiguities. Specifically:

1. Read the requirements and identify every ambiguous, vague, or missing piece of information not already resolved
2. Generate clarifying questions grouped by category (tech stack, users, scope, data model, performance, security, error handling)
3. Surface implicit assumptions you would otherwise bake silently into the spec

**If running autonomously (no human available to answer):**

Work through each remaining clarifying question yourself. For each one:

```
Q: [the clarifying question]
A: [your reasoned answer — explain why this is the conservative or most likely correct choice]
ASSUMPTION: [the assumption you are baking into the spec as a result]
```

Work through every question before writing the spec. Do not silently skip questions — an unanswered question baked into the spec without declaration becomes a hidden failure mode.

After all questions are resolved, produce:

```
ASSUMPTION REGISTER
1. [assumption] — reason: [why this was chosen]
2. [assumption] — reason: [why this was chosen]
...
```

The assumption register will be included in the spec so the plan and build stages can check their work against it.

**Step 2 — Write the spec**

Using the `spec-driven-development` skill (`.spiq/skills/SPEC_DRIVEN.md`), write a structured specification covering all six core areas: objective, commands, project structure, code style, testing strategy, and boundaries.

Include the ASSUMPTION REGISTER from Step 1 as the final section of the spec.

**Step 3 — Identify candidate skills**

Using the catalog below, identify which execution-phase skills this task will need.
The plan agent will finalise the list — your job is to give a well-reasoned first cut.
Select only skills the build or test stages will directly exercise. Do not pad the list.

{{SKILL_CATALOG}}

Add a `## Selected Skills` section at the end of SPEC.md with your candidate list:

```
## Selected Skills

Candidate: WEB_DEV, API_DESIGN, DATABASE
Rationale: Task builds a REST API backed by PostgreSQL with a browser UI.
```

Save the spec to: {{SPEC_FILE}}
