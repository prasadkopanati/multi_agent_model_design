---
description: Start spec-driven development — clarify requirements, then write a structured specification before writing code
---

{{SKILLS}}

The user's feature request is provided below:

{{REQUEST}}

**Step 0 — Challenge the framing**

Read `.spiq/skills/SPEC_CEO_CHALLENGE.md` and apply all five forcing questions to the request above before doing anything else. Record each answer explicitly. Add the `CHALLENGED PREMISES` section to the Assumption Register you will produce in Step 1.

This step costs one pass of reasoning before any spec is written. The alternative — discovering a misframed request at the review stage — costs a full pipeline cycle.

**Step 1 — Brainstorm and surface ambiguities**

Read `.spiq/skills/BRAINSTORMING.md` and apply it to the request above. Specifically:

1. Read the requirements and identify every ambiguous, vague, or missing piece of information
2. Generate clarifying questions grouped by category (tech stack, users, scope, data model, performance, security, error handling)
3. Surface implicit assumptions you would otherwise bake silently into the spec

**If running autonomously (no human available to answer):**

Work through each clarifying question yourself. For each one:

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

Save the spec to: {{SPEC_FILE}}
