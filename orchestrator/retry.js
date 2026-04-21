const fs = require("fs");
const path = require("path");

const TASKS_FILE = path.join(__dirname, "..", "tasks.json");
const OUTPUT_DIR  = path.join(__dirname, "..", "artifacts", "output");

function updateTaskFailure(stage, failure) {
  const task = JSON.parse(fs.readFileSync(TASKS_FILE));

  task.failure_state.count += 1; // observability counter; not used for escalation decisions
  task.failure_state.last_stage = stage;
  task.failure_state.last_error = failure;

  task.failure_state.history.push({
    stage,
    error: failure.error,
    time: Date.now(),
  });

  fs.writeFileSync(TASKS_FILE, JSON.stringify(task, null, 2));

  return task;
}

function shouldEscalate(task, stage) {
  const stageFailures = task.failure_state.history.filter(h => h.stage === stage).length;
  return stageFailures >= task.retry_limit;
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

// Runs the failure-analysis agent and returns its structured JSON output,
// or null if analysis itself fails, produces unparseable output, or has wrong shape.
function analyzeFailure(workspace, failure, runStage) {
  try {
    runStage("failure", workspace, { failure: failure.error });
    const outputPath = path.join(OUTPUT_DIR, "failure.json");
    if (fs.existsSync(outputPath)) {
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      return isValidAnalysis(parsed) ? parsed : null;
    }
  } catch {
    // analysis is best-effort; a failure here must not block the retry
  }
  return null;
}

function retryStage(stage, workspace, failure, runStage) {
  const task = updateTaskFailure(stage, failure);

  if (shouldEscalate(task, stage)) {
    task.human_required = true;
    fs.writeFileSync(TASKS_FILE, JSON.stringify(task, null, 2));

    console.log("🚨 Escalating to human due to repeated failures");
    process.exit(1);
  }

  console.log("🔁 Retrying stage:", stage);

  const analysis = analyzeFailure(workspace, failure, runStage);
  const context = analysis
    ? { failure: failure.error, analysis }
    : { failure: failure.error };

  return runStage(stage, workspace, context);
}

module.exports = { retryStage, shouldEscalate, analyzeFailure };
