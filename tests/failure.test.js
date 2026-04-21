const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { captureFailure } = require("../orchestrator/failure");

test("captureFailure returns a well-formed failure object and writes it to disk", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "failure-test-"));
  const failuresDir = path.join(tmpDir, "artifacts", "failures");
  fs.mkdirSync(failuresDir, { recursive: true });

  try {
    const error = new Error("something broke");
    const { failure, path: writtenPath } = captureFailure("build", error, "/workspace/wt-1", failuresDir);

    // object shape
    assert.equal(failure.stage, "build");
    assert.equal(failure.workspace, "/workspace/wt-1");
    assert.equal(typeof failure.timestamp, "number");
    assert.ok(failure.error.includes("something broke"));

    // file was written inside the temp dir, not the real project
    assert.ok(writtenPath.startsWith(failuresDir), `expected path under ${failuresDir}, got ${writtenPath}`);
    assert.ok(fs.existsSync(writtenPath), `expected file at ${writtenPath}`);
    const written = JSON.parse(fs.readFileSync(writtenPath, "utf-8"));
    assert.equal(written.stage, "build");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
