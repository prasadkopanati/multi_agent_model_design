"use strict";
const fs   = require("fs");
const path = require("path");

function appendEvent(cfg, type, stage, data = {}) {
  try {
    fs.mkdirSync(cfg.logsDir, { recursive: true });
    const event = { ts: new Date().toISOString(), type, stage, ...data };
    fs.appendFileSync(path.join(cfg.logsDir, "pipeline.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // non-fatal; event log is observability only, never a gate
  }
}

module.exports = { appendEvent };
