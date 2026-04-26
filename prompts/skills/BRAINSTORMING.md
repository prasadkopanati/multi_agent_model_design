---
name: brainstorming
description: Refine a vague requirement through Socratic questioning before writing a spec. Use at the start of the spec stage when requirements may be ambiguous, conflicting, or incomplete. Surfaces assumptions, explores alternatives, and validates a design premise before SPEC.md is written.
---

# Brainstorming

## Overview

Requirements are rarely complete on arrival. This skill runs a structured clarification phase before the spec is written, so ambiguities are resolved while they are still cheap — not after a complete SPEC.md has been written and rejected.

**The rule:** Never write a spec against unvalidated premises. Surface unknowns first; write the spec against what is confirmed.

## When to Use

- At the start of the spec stage, before writing SPEC.md
- When requirements use vague terms ("simple", "fast", "easy to use", "flexible")
- When tech stack or constraints are not specified
- When acceptance criteria are missing or unmeasurable
- When two requirements could conflict

**When NOT to use:** When requirements are already detailed and unambiguous (clear objective, concrete tech stack, explicit acceptance criteria, measurable outcomes). If everything is already specified, proceed directly to the spec.

## The Clarification Protocol

### Step 1: Read the Requirements

Read the full requirements document. On the first pass, do not write anything. Look for:

```
AMBIGUITY SIGNALS:
✗ "Modern UI" — not measurable
✗ "Should be fast" — no threshold
✗ "Standard authentication" — which standard?
✗ "Support multiple formats" — which ones?
✗ "Easy for non-technical users" — who specifically?

MISSING SIGNALS:
✗ No tech stack specified
✗ No deployment environment mentioned
✗ No scalability requirements
✗ No error handling expectations
✗ No data retention or privacy constraints
```

### Step 2: Generate Clarifying Questions

Produce a focused list of questions. Group them by category. Limit to the questions that would actually change the design if answered differently.

```
CLARIFYING QUESTIONS:

Tech Stack & Environment
1. Is there an existing codebase this must integrate with?
2. What is the target deployment environment? (browser, Node.js server, CLI, mobile)
3. Are there dependencies or libraries you want used or avoided?

Users & Context
4. Who are the primary users? (technical, non-technical, internal, public)
5. What devices or browsers must be supported?

Scope & Behavior
6. [Specific question about ambiguous requirement #1]
7. [Specific question about ambiguous requirement #2]

Scale & Performance
8. What is the expected data volume at launch vs. peak?
9. Are there specific performance thresholds? (response time, load time, throughput)
```

**Keep it short.** More than 8-10 questions signals the requirements need a complete rewrite, not clarification.

### Step 3: Explore Design Alternatives

For any requirement where multiple approaches are architecturally plausible, name the alternatives and their trade-offs. Do not pick one — present them:

```
DESIGN ALTERNATIVES:

[Requirement: "User authentication"]

Option A: Email + password with JWT sessions
  ✓ Full control, no third-party dependency
  ✗ Must implement password reset, email verification, security hardening

Option B: OAuth with a provider (Google, GitHub)
  ✓ Delegates auth complexity; users have fewer passwords to manage
  ✗ Requires users to have a provider account; adds third-party dependency

Option C: Magic links (passwordless email)
  ✓ No passwords to manage or store
  ✗ Requires reliable email delivery; slightly more friction per login
```

Present only alternatives that are genuinely viable. Do not include strawman options.

### Step 4: Surface Implicit Assumptions

List the assumptions that would be baked into the spec if clarification is skipped:

```
ASSUMPTIONS I WOULD MAKE (verify or override):
1. Node.js + Express backend (no stack specified)
2. PostgreSQL for persistence (no database specified)
3. Single-tenant (no multi-tenancy mentioned)
4. English-only (no i18n mentioned)
5. No offline support required
6. No accessibility requirements beyond WCAG AA
→ Are any of these wrong?
```

### Step 5: Present and Validate

Assemble the output from Steps 2-4 into a concise design premise document. Present it to the human for validation before writing SPEC.md.

If the human provides corrections or choices, incorporate them. If using autonomous mode (no human in the loop), use the conservative default for each ambiguity and document it clearly in the spec.

### Step 6: Write the Spec Against Validated Premises

Once the design premise is validated (or conservative defaults are selected), proceed to write SPEC.md. The spec should not re-open questions that were just answered.

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Asking about every possible edge case | Question fatigue; blocks progress on the 20% of questions that actually matter |
| Making assumptions silently | The human discovers them only after a full spec is written and rejects it |
| Presenting too many alternatives | Decision paralysis; present at most 3, favor the simplest |
| Asking questions you can answer from the requirements | Wastes the human's time |
| Skipping this step because "requirements seem clear" | "Seems clear" is how assumptions get baked in |

## Verification

Before writing SPEC.md:

- [ ] All vague or unmeasurable terms have been flagged or resolved
- [ ] Tech stack and deployment environment are confirmed
- [ ] Acceptance criteria are concrete and measurable
- [ ] Design alternatives for non-trivial decisions have been presented
- [ ] Implicit assumptions are documented and validated
- [ ] Conflicting requirements are surfaced and resolved
