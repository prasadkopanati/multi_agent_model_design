const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldEscalate, analyzeFailure } = require("../orchestrator/retry");
const fs = require("fs");
const os = require("os");
const path = require("path");

function makeTask(history, retryLimit = 3) {
  return {
    retry_limit: retryLimit,
    failure_state: { history },
  };
}

// shouldEscalate: escalates when stageFailures > retry_limit (not >=).
// retry_limit=3 means 3 retries are allowed (4 total attempts before escalation).

test("does not escalate when stage failures are at or below the retry limit", () => {
  const task = makeTask([
    { stage: "build", error: "e1", time: 1 },
    { stage: "build", error: "e2", time: 2 },
    { stage: "build", error: "e3", time: 3 },
  ]);
  assert.equal(shouldEscalate(task, "build"), false); // 3 > 3 → false
});

test("escalates when stage failures exceed the retry limit", () => {
  const task = makeTask([
    { stage: "build", error: "e1", time: 1 },
    { stage: "build", error: "e2", time: 2 },
    { stage: "build", error: "e3", time: 3 },
    { stage: "build", error: "e4", time: 4 },
  ]);
  assert.equal(shouldEscalate(task, "build"), true); // 4 > 3 → true
});

test("does not count failures from other stages toward the current stage limit", () => {
  const task = makeTask([
    { stage: "spec", error: "e1", time: 1 },
    { stage: "spec", error: "e2", time: 2 },
    { stage: "spec", error: "e3", time: 3 },
    { stage: "spec", error: "e4", time: 4 },
    { stage: "build", error: "e5", time: 5 },
  ]);
  assert.equal(shouldEscalate(task, "build"), false); // 1 build failure, 1 > 3 → false
  assert.equal(shouldEscalate(task, "spec"), true);   // 4 spec failures, 4 > 3 → true
});

test("does not escalate when failures equal retry_limit — only when exceeded", () => {
  const task = makeTask(
    [{ stage: "test", error: "e", time: 1 }],
    1
  );
  assert.equal(shouldEscalate(task, "test"), false); // 1 > 1 → false (at limit, not past it)
});

test("escalates when failures exceed a retry_limit of 1", () => {
  const task = makeTask(
    [
      { stage: "test", error: "e1", time: 1 },
      { stage: "test", error: "e2", time: 2 },
    ],
    1
  );
  assert.equal(shouldEscalate(task, "test"), true); // 2 > 1 → true
});

test("returns false for a stage with no failures", () => {
  const task = makeTask([{ stage: "build", error: "e", time: 1 }]);
  assert.equal(shouldEscalate(task, "spec"), false);
});

// analyzeFailure tests

test("analyzeFailure returns null when executeDirect throws", () => {
  const throwingDirect = () => { throw new Error("analysis agent unavailable"); };
  const result = analyzeFailure("/workspace", { error: "original error" }, throwingDirect, "/irrelevant/dir");
  assert.equal(result, null);
});

test("analyzeFailure returns null when output file is absent", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-test-"));
  const outputDir = path.join(tmpDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const noOpDirect = () => {};
    const result = analyzeFailure("/workspace", { error: "some error" }, noOpDirect, outputDir);
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("analyzeFailure returns null when output JSON has wrong shape", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-test-"));
  const outputDir = path.join(tmpDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "failure.json"), JSON.stringify({ unexpected: true }));
  try {
    const noOpDirect = () => {};
    const result = analyzeFailure("/workspace", { error: "err" }, noOpDirect, outputDir);
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("analyzeFailure returns parsed object when output is well-formed", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-test-"));
  const outputDir = path.join(tmpDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const validAnalysis = {
    root_cause: "missing null check",
    fix_strategy: "add guard clause",
    affected_files: ["src/api.js"],
    confidence: 0.9,
  };
  fs.writeFileSync(path.join(outputDir, "failure.json"), JSON.stringify(validAnalysis));

  try {
    const noOpDirect = () => {};
    const result = analyzeFailure("/workspace", { error: "err" }, noOpDirect, outputDir);
    assert.deepEqual(result, validAnalysis);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
