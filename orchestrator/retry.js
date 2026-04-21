const fs = require("fs");
const { runStage } = require("./orchestrator");

function updateTaskFailure(stage, failure) {
  const task = JSON.parse(fs.readFileSync("tasks.json"));

  task.failure_state.count += 1;
  task.failure_state.last_stage = stage;
  task.failure_state.last_error = failure;

  task.failure_state.history.push({
    stage,
    error: failure.error,
    time: Date.now()
  });

  fs.writeFileSync("tasks.json", JSON.stringify(task, null, 2));

  return task;
}

function shouldEscalate(task) {
  return task.failure_state.count >= task.retry_limit;
}

function retryStage(stage, workspace, failure) {
  const task = updateTaskFailure(stage, failure);

  if (shouldEscalate(task)) {
    task.human_required = true;
    fs.writeFileSync("tasks.json", JSON.stringify(task, null, 2));

    console.log("🚨 Escalating to human due to repeated failures");
    process.exit(1);
  }

  console.log("🔁 Retrying stage:", stage);

  return runStage(stage, workspace, {
    failure: failure.error
  });
}

module.exports = { retryStage };
