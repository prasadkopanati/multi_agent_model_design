---
description: Start spec-driven development — clarify requirements, then write a structured specification before writing code
---

{{SKILLS}}

The user's feature request is provided below:

{{REQUEST}}

**Before writing the spec**, follow the `brainstorming` skill (`.spiq/skills/BRAINSTORMING.md`):
1. Read the requirements and identify any ambiguous, vague, or missing information
2. Generate clarifying questions grouped by category (tech stack, users, scope, performance)
3. Surface implicit assumptions you would otherwise bake into the spec
4. If running autonomously (no human in the loop), document all assumptions and proceed with conservative defaults

**Then write the spec** using the `spec-driven-development` skill (`.spiq/skills/SPEC_DRIVEN.md`), covering all six core areas: objective, commands, project structure, code style, testing strategy, and boundaries.

Save the spec to: {{SPEC_FILE}}
