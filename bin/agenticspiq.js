#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path          = require("path");
const { scaffold }  = require("../utils/scaffold");

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs[0] === "--version" || rawArgs[0] === "-v") {
    const pkg = require("../package.json");
    console.log(pkg.version);
    process.exit(0);
    return;
  }

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

  if (rawArgs[0] === "--changemodel" || rawArgs[0] === "changemodel") {
    const { changeModel } = require("../utils/changemodel");
    const envPath = path.join(__dirname, "..", ".env");
    await changeModel(envPath, rawArgs.slice(1));
    process.exit(0);
    return;
  }

  // Show help if invoked with no args or --help
  if (rawArgs.length === 0 || rawArgs[0] === "--help" || rawArgs[0] === "-h") {
    console.log(`
Usage: agenticspiq [options]

Options:
  --version, -v          Print version and exit
  --help, -h             Show this help
  check                  Verify agent config and CLI tool availability (gh, glab)
  doctor                 Diagnose workspace issues
  changemodel            Switch agent model

Pipeline options:
  --workspace <path>     Workspace directory (default: cwd)
  --req <file>           Path to requirements file (consumed by scaffold, not forwarded)
  --stages <list>        Comma-separated list of pipeline stages to run
                         (default: all stages)
                         Valid stages: brainstorm,spec,research,plan,build,test,review,finish
                         Rules: spec and plan are required; finish must be last if included

Examples:
  agenticspiq                                   Run full pipeline in cwd
  agenticspiq --workspace ./myproject           Run full pipeline in ./myproject
  agenticspiq --stages spec,plan,finish         Planning only (skip build/test/review)
  agenticspiq --stages spec,plan,build,test,review,finish  Skip brainstorm and research
`);
    process.exit(0);
    return;
  }

  // Extract --workspace (default: cwd)
  const wsIdx = rawArgs.findIndex(a => a === "--workspace");
  const workspace = wsIdx !== -1 ? rawArgs[wsIdx + 1] : process.cwd();

  // Extract --req (consumed here; not forwarded to orchestrator)
  const reqIdx = rawArgs.findIndex(a => a === "--req");
  const reqFile = reqIdx !== -1 ? rawArgs[reqIdx + 1] : undefined;

  // Extract --stages (set as env var; strip from forwardArgs so orchestrator's parseArgs handles it via env)
  const stagesIdx = rawArgs.findIndex(a => a === "--stages");
  const stagesValue = stagesIdx !== -1 ? rawArgs[stagesIdx + 1] : undefined;
  if (stagesValue) process.env.SPIQ_STAGES = stagesValue;

  const forwardArgs = rawArgs.filter((_, i) =>
    i !== reqIdx && i !== reqIdx + 1 &&
    i !== stagesIdx && i !== stagesIdx + 1
  );

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
