const fs = require("fs");
const path = require("path");
const { appendEvent } = require("../utils/event-log");

function updateTaskFailure(stage, failure, tasksFile) {
  const task = JSON.parse(fs.readFileSync(tasksFile));

  task.failure_state.count += 1; // observability counter; not used for escalation decisions
  task.failure_state.last_stage = stage;
  task.failure_state.last_error = failure;

  task.failure_state.history.push({
    stage,
    error: failure.error,
    time: Date.now(),
  });

  fs.writeFileSync(tasksFile, JSON.stringify(task, null, 2));

  return task;
}

function shouldEscalate(task, stage) {
  const stageFailures = task.failure_state.history.filter(h => h.stage === stage).length;
  return stageFailures > task.retry_limit;
}

function isValidAnalysis(obj) {
  return (
    obj !== null &&
    typeof obj === "object" &&
    typeof obj.root_cause === "string" &&
    typeof obj.fix_strategy === "string" &&
    Array.isArray(obj.affected_files) &&
    typeof obj.confidence === "number"
  );
}

function writeHandoff(stage, task, cfg) {
  try {
    const history = task.failure_state.history;
    const lines = [
      "# Task Handoff",
      "",
      "> This file is injected into the next build attempt. It contains context from the",
      "> previous pipeline run that failed after repeated retries.",
      "",
      `**Stage that escalated:** \`${stage}\``,
      `**Total failures recorded:** ${history.length}`,
      `**Retry limit:** ${task.retry_limit}`,
      "",
      "## Last Error",
      "",
      "```",
      typeof task.failure_state.last_error === "string"
        ? task.failure_state.last_error
        : JSON.stringify(task.failure_state.last_error, null, 2),
      "```",
      "",
      "## Failure History",
      "",
    ];

    for (const h of history) {
      lines.push(`- **[${h.stage}]** ${new Date(h.time).toISOString()}: ${h.error || "(no message)"}`);
    }

    lines.push(
      "",
      "## Recommended Actions",
      "",
      "1. Review `.spiq/tasks/plan.md` — is the task scoped too broadly?",
      "2. Check `.spiq/artifacts/failures/` for structured failure analysis.",
      "3. Fix the root cause identified above, then re-run the pipeline.",
      "4. If the spec or plan itself is wrong, update `.spiq/req.md` and re-run from scratch.",
    );

    fs.writeFileSync(cfg.handoffFile, lines.join("\n"));
  } catch {
    // non-fatal; handoff write is best-effort
  }
}

// Runs the failure-analysis agent and returns its structured JSON output,
// or null if analysis itself fails, produces unparseable output, or has wrong shape.
// executeDirect must be a non-retrying runner so a failure here cannot call process.exit.
function analyzeFailure(workspace, failure, executeDirect, outputDir) {
  try {
    executeDirect("failure", workspace, { failure: failure.error });
    const outputPath = path.join(outputDir, "failure.json");
    if (fs.existsSync(outputPath)) {
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      return isValidAnalysis(parsed) ? parsed : null;
    }
  } catch {
    // analysis is best-effort; a failure here must not block the retry
  }
  return null;
}

function retryStage(stage, workspace, failure, runStage, executeDirect, cfg) {
  const task = updateTaskFailure(stage, failure, cfg.tasksFile);

  appendEvent(cfg, "stage_failure", stage, { error: failure.error, failures: task.failure_state.history.length });

  if (shouldEscalate(task, stage)) {
    task.human_required = true;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));

    writeHandoff(stage, task, cfg);
    appendEvent(cfg, "pipeline_escalated", stage, { reason: "max_retries_exceeded" });

    console.log("🚨 Escalating to human due to repeated failures");
    console.log(`📋 Handoff written → ${cfg.handoffFile}`);
    process.exit(1);
  }

  console.log("🔁 Retrying stage:", stage);
  appendEvent(cfg, "stage_retry", stage, { attempt: task.failure_state.history.filter(h => h.stage === stage).length });

  const analysis = analyzeFailure(workspace, failure, executeDirect, cfg.outputDir);
  const context = analysis
    ? { failure: failure.error, analysis }
    : { failure: failure.error };

  return runStage(stage, workspace, context, cfg);
}

module.exports = { retryStage, shouldEscalate, analyzeFailure };
