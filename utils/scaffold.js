const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const SPIQ_DIRS = [
  "artifacts/compiled",
  "artifacts/failures",
  "artifacts/logs",
  "artifacts/output",
  "tasks",
];

const REQ_TEMPLATE = `# Feature Request

## Objective
<!-- What do you want to build? -->

## Target Users
<!-- Who will use this? -->

## Core Features
<!-- List the key functionality -->

## Acceptance Criteria
<!-- How will you know it is done? -->

## Tech Stack
<!-- Preferred technologies -->

## Constraints
<!-- Boundaries and limitations -->
`;

const CANDIDATE_NAMES = [
  "REQUIREMENTS.md",
  "requirements.md",
  "SPEC.md",
  "BRIEF.md",
  "brief.md",
  "docs/requirements.md",
];

async function ensureDirs(workspace) {
  const spiqDir = path.join(workspace, ".spiq");
  for (const dir of SPIQ_DIRS) {
    const full = path.join(spiqDir, dir);
    fs.mkdirSync(full, { recursive: true });
    const keep = path.join(full, ".gitkeep");
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
  }
}

async function ensureRequirements(workspace, opts = {}) {
  const reqFile = path.join(workspace, ".spiq", "req.md");
  if (fs.existsSync(reqFile)) return;

  // 1. Explicit --req flag
  if (opts.req) {
    const src = path.resolve(workspace, opts.req);
    fs.copyFileSync(src, reqFile);
    console.log(`Requirements sourced from ${opts.req} → .spiq/req.md`);
    return;
  }

  // 2. Piped stdin
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const content = chunks.every(c => typeof c === "string")
      ? chunks.join("")
      : Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString();
    fs.writeFileSync(reqFile, content);
    console.log("Requirements written from stdin → .spiq/req.md");
    return;
  }

  // 3. Auto-detect common requirement files
  const candidates = CANDIDATE_NAMES.filter(n => fs.existsSync(path.join(workspace, n)));

  if (candidates.length > 0) {
    console.log("\nFound possible requirements files:");
    candidates.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
    console.log("  [s] Skip — I'll fill in .spiq/req.md manually\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question(`Select [1-${candidates.length}/s]: `, r));
    rl.close();

    const idx = parseInt(answer, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= candidates.length) {
      fs.copyFileSync(path.join(workspace, candidates[idx - 1]), reqFile);
      console.log(`Requirements copied from ${candidates[idx - 1]} → .spiq/req.md`);
      return;
    }
  }

  // 4. Fallback — write template and stop so user can fill it in
  fs.writeFileSync(reqFile, REQ_TEMPLATE);
  console.log("Created .spiq/req.md — fill it in, then re-run agenticspiq.");
  process.exit(0);
}

async function scaffold(workspace, opts = {}) {
  await ensureDirs(workspace);
  await ensureRequirements(workspace, opts);
}

module.exports = { scaffold };
