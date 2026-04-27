const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const { stripFrontmatter } = require("../orchestrator/promptCompiler");

const SKILLS_SRC = path.join(__dirname, "..", "prompts", "skills");

const SPIQ_DIRS = [
  "artifacts/compiled",
  "artifacts/failures",
  "artifacts/logs",
  "artifacts/output",
  "tasks",
];

const INITIAL_TASKS = {
  current_stage: null,
  mode: "normal",
  retry_limit: 3,
  failure_state: { count: 0, last_stage: null, last_error: null, history: [] },
  human_required: false,
  token_budget: { total: 200000, used: 0 },
};

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

function assertSpiqNotIgnored(workspace) {
  const gitDir = path.join(workspace, ".git");
  if (!fs.existsSync(gitDir)) return;

  const check = spawnSync("git", ["check-ignore", "-q", ".spiq"], { cwd: workspace });
  if (check.status !== 0) return;

  console.error(`
Error: .spiq/ is excluded by your .gitignore (or a parent ignore rule).

The agenticspiq pipeline requires all agents to read and write files inside
.spiq/ (spec, plan, skills, task artifacts). Ignoring it breaks the pipeline.

To fix:
  1. Open the .gitignore in your workspace: ${path.join(workspace, ".gitignore")}
  2. Remove or comment out any line that matches .spiq/, .spiq, or a wildcard
     that covers it (e.g. .*).
  3. Re-run agenticspiq.

Note: .spiq/ is intentionally tracked — it holds pipeline state, not build output.
`);
  process.exit(1);
}

async function ensureDirs(workspace) {
  const spiqDir = path.join(workspace, ".spiq");
  for (const dir of SPIQ_DIRS) {
    const full = path.join(spiqDir, dir);
    fs.mkdirSync(full, { recursive: true });
    const keep = path.join(full, ".gitkeep");
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
  }

  const tasksFile = path.join(spiqDir, "tasks.json");
  if (!fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, JSON.stringify(INITIAL_TASKS, null, 2));
  }

  if (!fs.existsSync(path.join(workspace, ".git"))) {
    spawnSync("git", ["init"], { cwd: workspace });
    spawnSync("git", ["config", "user.name",  "agenticspiq-agent"], { cwd: workspace });
    spawnSync("git", ["config", "user.email", "agent@agenticspiq.local"], { cwd: workspace });
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

function ensureSkills(workspace) {
  const dest = path.join(workspace, ".spiq", "skills");
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(SKILLS_SRC)) {
    if (!f.endsWith(".md")) continue;
    const raw      = fs.readFileSync(path.join(SKILLS_SRC, f), "utf-8");
    const clean    = stripFrontmatter(raw);   // strip YAML so agents never see ---name:--- directives
    const destFile = path.join(dest, f);
    if (!fs.existsSync(destFile) || fs.readFileSync(destFile, "utf-8") !== clean) {
      fs.writeFileSync(destFile, clean);
    }
  }
}

async function scaffold(workspace, opts = {}) {
  await ensureDirs(workspace);
  assertSpiqNotIgnored(workspace);
  ensureSkills(workspace);
  await ensureRequirements(workspace, opts);
}

module.exports = { scaffold };
