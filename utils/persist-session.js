"use strict";
const fs   = require("fs");
const path = require("path");

const VAULT_DIR = "prompt_vault";

const SPEC_HEADINGS = [
  "Objective", "Commands", "Project Structure", "Code Style",
  "Testing Strategy", "Boundaries", "Success Criteria", "Assumption Register",
];

function specDiffersFromReq(req, spec) {
  if (!req || !spec) return false;
  if (spec.length / req.length <= 1.4) return false;
  const matches = SPEC_HEADINGS.filter(h => spec.includes(`## ${h}`));
  return matches.length >= 2;
}

function buildSessionSummary(cfg) {
  const stages = ["spec", "plan", "build", "test", "review", "finish"];
  let tasks;
  try {
    tasks = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
  } catch {
    tasks = { failure_state: { count: 0, history: [] } };
  }

  const history = (tasks.failure_state?.history || []).slice(0, 20);
  const retryCounts = Object.fromEntries(stages.map(s => [s, 0]));
  for (const entry of history) {
    if (retryCounts[entry.stage] !== undefined) retryCounts[entry.stage]++;
  }

  let startedAt = null;
  const specOutput = path.join(cfg.outputDir, "spec.json");
  if (fs.existsSync(specOutput)) {
    startedAt = fs.statSync(specOutput).mtimeMs;
  }

  return {
    stages_completed: stages,
    retry_counts: retryCounts,
    failure_count: tasks.failure_state?.count || 0,
    failure_history: history,
    pipeline_started_at: startedAt,
    pipeline_completed_at: Date.now(),
  };
}

function formatDatetime(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
         `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "unknown";
  const secs  = Math.floor(ms / 1000);
  const mins  = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0)  return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

function formatTs(ms) {
  if (!ms) return "unknown";
  const d   = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderMarkdown(req, spec, summary, specIsEvolved, workspace, vaultFile) {
  const completedStr = formatTs(summary.pipeline_completed_at);
  const lines = [`# Session Record — ${completedStr}`, ""];

  lines.push("## Initial Requirement", "");
  lines.push(req || "_req.md not found at archive time._", "");
  lines.push("---", "");

  lines.push("## Session Summary", "");
  const failsByStage = Object.entries(summary.retry_counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s}: ${n}`)
    .join(", ") || "none";

  const startedStr = formatTs(summary.pipeline_started_at);
  const duration   = summary.pipeline_started_at
    ? formatDuration(summary.pipeline_completed_at - summary.pipeline_started_at)
    : "unknown";

  lines.push(
    "| Field | Value |",
    "|---|---|",
    `| Stages completed | ${summary.stages_completed.join(" → ")} |`,
    `| Total failures | ${summary.failure_count} |`,
    `| Failures by stage | ${failsByStage} |`,
    `| Pipeline started | ${startedStr} |`,
    `| Pipeline completed | ${completedStr} |`,
    `| Duration | ${duration} |`,
    "",
  );

  if (summary.failure_history.length > 0) {
    lines.push("### Failure History", "");
    lines.push("| # | Stage | Error | Time |", "|---|---|---|---|");
    summary.failure_history.forEach((entry, i) => {
      const err  = String(entry.error || "").replace(/\n/g, " ").slice(0, 80);
      const time = entry.time ? formatTs(entry.time) : "—";
      lines.push(`| ${i + 1} | ${entry.stage} | ${err} | ${time} |`);
    });
    lines.push("");
  }

  lines.push("---", "");

  if (specIsEvolved) {
    const ratio = spec && req ? (spec.length / req.length).toFixed(1) : "?";
    lines.push("## Winning Prompt (SPEC.md)", "");
    lines.push(
      `> SPEC.md is meaningfully evolved from the initial requirement ` +
      `(length ratio: ${ratio}×, structured sections detected). ` +
      `This is the effective prompt that drove successful execution.`,
      "",
    );
    lines.push(spec, "");
  } else if (!spec) {
    lines.push("## Winning Prompt", "");
    lines.push("> SPEC.md was not found at archive time. The initial requirement above served as the effective prompt.", "");
  } else {
    lines.push("## Spec Evolution Note", "");
    lines.push(
      "> SPEC.md is not meaningfully different from req.md (length ratio below threshold or " +
      "structured sections not detected). The initial requirement above served as the effective " +
      "prompt. SPEC.md is omitted to avoid duplication.",
      "",
    );
  }

  lines.push("---", "");

  const ratio = spec && req ? parseFloat((spec.length / req.length).toFixed(2)) : null;
  lines.push(
    "## Metadata",
    "",
    "```json",
    JSON.stringify({ workspace, vault_file: vaultFile, spec_evolved: specIsEvolved, spec_length_ratio: ratio }, null, 2),
    "```",
    "",
  );

  return lines.join("\n");
}

function persistSession(workspace, cfg) {
  const req  = fs.existsSync(cfg.reqFile)  ? fs.readFileSync(cfg.reqFile,  "utf-8") : null;
  const spec = fs.existsSync(cfg.specFile) ? fs.readFileSync(cfg.specFile, "utf-8") : null;

  const specIsEvolved = specDiffersFromReq(req, spec);
  const summary       = buildSessionSummary(cfg);

  const datetime = formatDatetime(new Date());
  const vaultDir = path.join(workspace, VAULT_DIR);
  fs.mkdirSync(vaultDir, { recursive: true });

  let filename = `${datetime}.md`;
  let n = 2;
  while (fs.existsSync(path.join(vaultDir, filename))) {
    filename = `${datetime}-${n++}.md`;
  }

  const content = renderMarkdown(req, spec, summary, specIsEvolved, workspace, filename);
  const outPath = path.join(vaultDir, filename);
  fs.writeFileSync(outPath, content);
  return outPath;
}

module.exports = { persistSession, specDiffersFromReq, buildSessionSummary };
