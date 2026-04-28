# FAILURE ANALYSIS

You are a debugging controller.

{{SKILLS}}

## Iron Law

No fix without a trace from symptom to origin. Read `.spiq/skills/FAILURE_INVESTIGATION.md` and apply the four-step investigation protocol to the failure below before forming any fix strategy.

## Failure Log

{{FAILURE}}

---

After completing the investigation, return STRICT JSON derived from your investigation steps — not from pattern-matching on the error message:

{
  "root_cause": "",
  "fix_strategy": "",
  "affected_files": [],
  "confidence": 0.0
}

{{DEBUGGING}}
