#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path          = require("path");
const { scaffold }  = require("../utils/scaffold");

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs[0] === "check") {
    const { checkConfig } = require("../utils/config-test");
    const ok = await checkConfig();
    process.exit(ok ? 0 : 1);
    return;
  }

  if (rawArgs[0] === "--doctor" || rawArgs[0] === "doctor") {
    const wsIdx2 = rawArgs.findIndex(a => a === "--workspace");
    const doctorWorkspace = wsIdx2 !== -1 ? rawArgs[wsIdx2 + 1] : process.cwd();
    const { runDoctor } = require("../utils/doctor");
    await runDoctor(doctorWorkspace);
    process.exit(0);
    return;
  }

  // Extract --workspace (default: cwd)
  const wsIdx = rawArgs.findIndex(a => a === "--workspace");
  const workspace = wsIdx !== -1 ? rawArgs[wsIdx + 1] : process.cwd();

  // Extract --req (consumed here; not forwarded to orchestrator)
  const reqIdx = rawArgs.findIndex(a => a === "--req");
  const reqFile = reqIdx !== -1 ? rawArgs[reqIdx + 1] : undefined;
  const forwardArgs = rawArgs.filter((_, i) => i !== reqIdx && i !== reqIdx + 1);

  // Ensure --workspace is in the forwarded args
  if (!forwardArgs.some(a => a === "--workspace" || a.startsWith("--workspace="))) {
    forwardArgs.push("--workspace", workspace);
  }

  // Scaffold .spiq/ on first run (no-op if already set up)
  await scaffold(workspace, { req: reqFile });

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "../orchestrator/orchestrator.js"), ...forwardArgs],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
