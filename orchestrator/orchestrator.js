const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { spawnSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const { retryStage } = require("./retry");
const { makeWorkspaceConfig } = require("./workspace-config");
const { persistSession } = require("../utils/persist-session");
const { resetWorkspace } = require("../utils/reset-workspace");
const { appendEvent } = require("../utils/event-log");

const DEFAULT_AGENTS = {
  brainstorm: "claude",
  spec:    "claude",
  plan:    "claude",
  review:  "claude",
  finish:  "gemini",
  failure: "claude",
  build:   "opencode",
  test:    "opencode",
  fix:     "opencode",
};

function getAgentForStage(stage) {
  const envVar = `AGENT_${stage.toUpperCase()}`;
  return process.env[envVar] || DEFAULT_AGENTS[stage];
}

function updateCurrentStage(stage, cfg) {
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    task.current_stage = stage;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
  } catch {
    // non-fatal; tasks.json observability is best-effort
  }
}

function readCurrentStage(cfg) {
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    return task.current_stage || null;
  } catch {
    return null;
  }
}

function readOutputArtifact(stage, cfg) {
  try {
    return fs.readFileSync(path.join(cfg.outputDir, `${stage}.json`), "utf-8");
  } catch {
    return null;
  }
}

function executeStage(stage, workspace, context = {}, cfg) {
  const prompt = compilePrompt(stage, context);

  fs.mkdirSync(cfg.compiledDir, { recursive: true });
  fs.mkdirSync(cfg.outputDir,   { recursive: true });
  const inputFile  = path.join(cfg.compiledDir, `${stage}.md`);
  fs.writeFileSync(inputFile, prompt);

  const agent      = getAgentForStage(stage);
  const outputFile = path.join(cfg.outputDir, `${stage}.json`);
  const agentCli   = path.join(__dirname, "..", "agent-cli", "agent-cli.js");

  // Use worktree as cwd for execution stages when worktree is active
  const execWorkspace = context.execWorkspace || workspace;

  console.log(`▶ Running stage: ${stage} [${agent}]${execWorkspace !== workspace ? " (worktree)" : ""}`);

  const result = spawnSync(
    process.execPath,
    [agentCli, "--agent", agent, "--stage", stage, "--input", inputFile, "--output", outputFile, "--workspace", execWorkspace],
    { stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`agent-cli exited with status ${result.status}`);
}

function runStage(stage, workspace, context = {}, cfg) {
  try {
    executeStage(stage, workspace, context, cfg);
  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace, cfg.failuresDir);
    return retryStage(stage, workspace, failure, runStage, executeStage, cfg);
  }
}

function extractText(rawOutput) {
  try {
    const parsed = JSON.parse(rawOutput);
    return parsed.result ?? parsed.content ?? parsed.text ?? rawOutput;
  } catch {
    return rawOutput;
  }
}

function printReviewSummary(rawOutput) {
  try {
    const text = extractText(rawOutput);
    const match = text.match(/REVIEW SUMMARY[\s\S]*$/m);
    if (match) console.log("\n" + match[0].trim());
  } catch {
    // non-fatal; summary is best-effort
  }
}

function isReviewPass(rawOutput) {
  if (!rawOutput) return false;
  const text = extractText(rawOutput);
  return /verdict\s*:\s*pass/i.test(text);
}

function writePlanArtifacts(cfg, rawOutput) {
  try {
    const text = extractText(rawOutput);
    fs.mkdirSync(cfg.planDir, { recursive: true });
    fs.writeFileSync(cfg.planFile, text);
  } catch {
    // non-fatal; executor will also attempt this directly
  }
}

function writeHandoffArtifact(cfg, rawOutput) {
  try {
    const text = extractText(rawOutput);
    if (!text) return;
    // Prefer the structured handoff block; fall back to the full output text.
    const match = text.match(/BUILD HANDOFF SUMMARY[\s\S]*/i);
    const content = (match ? match[0] : text).trim();
    if (content) fs.writeFileSync(cfg.handoffFile, content);
  } catch { /* non-fatal */ }
}

function extractSelectedSkills(rawOutput) {
  if (!rawOutput) return [];
  try {
    const text = extractText(rawOutput);
    const match = text.match(/^SELECTED_SKILLS:\s*(.+)$/m);
    if (!match) return [];
    const raw = match[1].trim();
    if (raw.startsWith("[")) return JSON.parse(raw);
    return raw.split(",").map(s => s.trim().replace(/['"]/g, "")).filter(Boolean);
  } catch {
    return [];
  }
}

function persistSelectedSkills(skills, cfg) {
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    task.selected_skills = skills;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
  } catch {
    // non-fatal
  }
}

function loadHandoff(cfg) {
  try {
    if (fs.existsSync(cfg.handoffFile)) {
      return fs.readFileSync(cfg.handoffFile, "utf-8");
    }
  } catch { /* non-fatal */ }
  return null;
}

// ─── Worktree helpers ─────────────────────────────────────────────────────────

function setupWorktree(workspace, cfg) {
  // Verify this is a git repository
  const gitCheck = spawnSync("git", ["-C", workspace, "rev-parse", "--git-dir"], { stdio: "pipe" });
  if (gitCheck.status !== 0) {
    console.warn("⚠  Not a git repository — skipping worktree isolation, building in main workspace.");
    return null;
  }

  const branchName = `spiq/run-${Date.now()}`;
  const worktreePath = cfg.worktreePath;

  // Clean up any stale worktree at this path
  if (fs.existsSync(worktreePath)) {
    spawnSync("git", ["-C", workspace, "worktree", "remove", "--force", worktreePath], { stdio: "pipe" });
    try { fs.rmSync(worktreePath, { recursive: true, force: true }); } catch { /* best-effort */ }
  }

  const result = spawnSync(
    "git", ["-C", workspace, "worktree", "add", worktreePath, "-b", branchName],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    console.warn("⚠  git worktree add failed — building in main workspace.");
    return null;
  }

  // Keep .spiq-worktree out of git status in the main workspace
  try {
    const gitignorePath = path.join(workspace, ".gitignore");
    const entry = ".spiq-worktree\n";
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
    if (!existing.includes(".spiq-worktree")) {
      fs.appendFileSync(gitignorePath, (existing.endsWith("\n") || existing === "") ? entry : `\n${entry}`);
    }
  } catch { /* non-fatal */ }

  // Symlink .spiq/ into worktree so agents can access skills, prompts, state, etc.
  const worktreeSpiq = path.join(worktreePath, ".spiq");
  if (!fs.existsSync(worktreeSpiq)) {
    try {
      fs.symlinkSync(cfg.stateDir, worktreeSpiq);
    } catch (err) {
      console.warn(`⚠  Could not symlink .spiq into worktree: ${err.message}`);
    }
  }

  return branchName;
}

function persistWorktreeBranch(branch, cfg) {
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    task.worktree_branch = branch;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
  } catch { /* non-fatal */ }
}

// ─── Brainstorm helpers ───────────────────────────────────────────────────────

function isValidBrainstormOutput(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!["simple", "complex"].includes(obj.complexity)) return false;
  if (!Array.isArray(obj.design_options) || obj.design_options.length !== 3) return false;
  if (obj.design_options.filter(o => o.recommended === true).length !== 1) return false;
  if (!Array.isArray(obj.question_groups)) return false;
  return true;
}

function renderDesignOptions(options) {
  const SEP = "━".repeat(54);
  console.log("\n" + SEP);
  console.log("  BRAINSTORM — Requirements Clarification");
  console.log(SEP + "\n");
  console.log("DESIGN OPTIONS\n");
  for (const opt of options) {
    const tag = opt.recommended ? "   ★ RECOMMENDED" : "";
    console.log(`  [${opt.id}] ${opt.title}${tag}`);
    if (opt.summary) console.log(`      ${opt.summary}`);
    (opt.tradeoffs?.pros || []).forEach(p => console.log(`      + ${p}`));
    (opt.tradeoffs?.cons || []).forEach(c => console.log(`      - ${c}`));
    console.log();
  }
}

async function promptDesignSelection(options) {
  const recommended = options.find(o => o.recommended) || options[0];
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `Which design do you prefer? [1/2/3, Enter=${recommended.id} (recommended)]: `,
      (answer) => {
        rl.close();
        const n = parseInt(answer.trim(), 10);
        const selected = options.find(o => o.id === n) || recommended;
        resolve(selected);
      }
    );
  });
}

async function promptSingleQuestion(q) {
  const recommended = q.options.find(o => o.recommended) || q.options[0];
  console.log(`  ${q.text}`);
  q.options.forEach(o => {
    const tag = o.recommended ? " (recommended)" : "";
    console.log(`      [${o.n}] ${o.label}${tag}`);
  });

  const ask = () => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  Answer [Enter=${recommended.n}]: `, (a) => { rl.close(); resolve(a.trim()); });
  });

  let answer = await ask();
  let n = parseInt(answer, 10);
  if (answer && !q.options.find(o => o.n === n)) {
    answer = await ask();
    n = parseInt(answer, 10);
  }

  const chosen = q.options.find(o => o.n === n) || recommended;
  return { questionId: q.id, question: q.text, chosen: chosen.label };
}

async function promptQuestions(questionGroups) {
  const results = [];
  for (const group of questionGroups) {
    console.log(`\n${group.category}`);
    for (const q of group.questions) {
      results.push(await promptSingleQuestion(q));
    }
  }
  return results;
}

function formatBrainstormMd(data, selectedOption, answers) {
  const lines = [
    "# Brainstorm Session",
    "",
    "## Complexity Assessment",
    "",
    `**Verdict:** ${data.complexity.toUpperCase()}`,
    `**Rationale:** ${data.complexity_rationale}`,
    "",
    "## Selected Design Option",
    "",
    `**[${selectedOption.id}] ${selectedOption.title}**`,
    "",
    selectedOption.summary || "",
    "",
  ];

  if (selectedOption.tradeoffs?.pros?.length || selectedOption.tradeoffs?.cons?.length) {
    lines.push("**Trade-offs:**", "");
    (selectedOption.tradeoffs?.pros || []).forEach(p => lines.push(`- ✓ ${p}`));
    (selectedOption.tradeoffs?.cons || []).forEach(c => lines.push(`- ✗ ${c}`));
    lines.push("");
  }

  if (answers.length > 0) {
    lines.push("## Clarifying Questions — User Answers", "");
    for (const a of answers) {
      lines.push(`**${a.question}**`);
      lines.push(`→ ${a.chosen}`, "");
    }
  } else {
    lines.push("## Clarifying Questions", "");
    lines.push("_Skipped — requirements assessed as clear and complete. Recommended defaults apply._", "");
  }

  lines.push("---");
  lines.push("_These decisions are confirmed by the user. The spec stage must not re-open them._");
  return lines.join("\n");
}

async function runBrainstormStage(workspace, context, cfg) {
  runStage("brainstorm", workspace, context, cfg);

  const rawOutput = readOutputArtifact("brainstorm", cfg);
  if (!rawOutput) {
    console.warn("⚠  Brainstorm output not found — proceeding to spec without brainstorm.");
    return null;
  }

  let brainstormData;
  try {
    const text = extractText(rawOutput);
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    brainstormData = JSON.parse(cleaned);
  } catch {
    console.warn("⚠  Brainstorm output was not valid JSON — proceeding to spec without brainstorm.");
    return null;
  }

  if (!isValidBrainstormOutput(brainstormData)) {
    console.warn("⚠  Brainstorm JSON schema invalid — proceeding to spec without brainstorm.");
    return null;
  }

  renderDesignOptions(brainstormData.design_options);

  let selectedOption, answers;

  if (brainstormData.complexity === "simple") {
    console.log(`Complexity assessment: SIMPLE`);
    console.log(`${brainstormData.complexity_rationale}`);
    console.log("Skipping interactive Q&A. Proceeding to spec with recommended defaults.\n");
    selectedOption = brainstormData.design_options.find(o => o.recommended) || brainstormData.design_options[0];
    answers = [];
  } else {
    selectedOption = await promptDesignSelection(brainstormData.design_options);
    answers = await promptQuestions(brainstormData.question_groups);
  }

  const brainstormMd = formatBrainstormMd(brainstormData, selectedOption, answers);
  fs.writeFileSync(cfg.brainstormFile, brainstormMd);

  const SEP = "━".repeat(54);
  console.log("\n" + SEP);
  console.log(` Brainstorm saved → ${cfg.brainstormFile}`);
  console.log(SEP + "\n");

  const candidateSkills = Array.isArray(brainstormData.candidate_skills)
    ? brainstormData.candidate_skills
    : [];

  return { brainstormMd, candidateSkills };
}

// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE = [
  { stage: "brainstorm", contextKey: "brainstorm", requiresApproval: false, isBrainstorm: true },
  { stage: "spec",       contextKey: "spec",        requiresApproval: true  },
  { stage: "plan",       contextKey: "plan",        requiresApproval: true  },
  { stage: "build",      contextKey: "build",       requiresApproval: false, usesWorktree: true },
  { stage: "test",       contextKey: "test",        requiresApproval: false, usesWorktree: true },
  { stage: "review",     contextKey: "review",      requiresApproval: false },
  { stage: "finish",     contextKey: null,           requiresApproval: false, usesWorktree: true },
];

function promptApproval(stage, cfg) {
  const artifactPath = stage === "spec" ? cfg.specFile
                     : stage === "plan" ? cfg.planFile
                     : "(see .spiq/artifacts/output/)";
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n📋 ${stage.toUpperCase()} complete. Review: ${artifactPath}`);
    rl.question(`Approve and continue to next stage? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function readRequest(cfg) {
  if (!fs.existsSync(cfg.reqFile)) {
    console.error(`Error: req.md not found at ${cfg.reqFile}`);
    console.error("Run agenticspiq again — it will prompt you to set up requirements.");
    process.exit(1);
  }
  return fs.readFileSync(cfg.reqFile, "utf-8");
}

async function runPipeline(workspace) {
  const cfg = makeWorkspaceConfig(workspace);
  const request = readRequest(cfg);

  appendEvent(cfg, "pipeline_start", null, { workspace });

  // Determine resume point
  const savedStage = readCurrentStage(cfg);
  const resumeIdx = savedStage && savedStage !== "complete"
    ? PIPELINE.findIndex(p => p.stage === savedStage)
    : -1;
  const startIdx = resumeIdx >= 0 ? resumeIdx : 0;

  if (startIdx > 0) {
    console.log(`↩  Resuming from stage: ${PIPELINE[startIdx].stage}`);
  }

  // Pre-load context from persisted artifacts for stages that already completed
  let context = { request, specFile: cfg.specFile, planFile: cfg.planFile, planDir: cfg.planDir };

  // Load selected_skills persisted by the plan stage (survives pipeline restarts)
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    if (Array.isArray(task.selected_skills) && task.selected_skills.length > 0) {
      context = { ...context, selectedSkills: task.selected_skills };
    }
    // Load worktree branch if pipeline was previously set up
    if (task.worktree_branch && fs.existsSync(cfg.worktreePath)) {
      context = { ...context, featureBranch: task.worktree_branch, execWorkspace: cfg.worktreePath };
    }
  } catch { /* non-fatal */ }

  for (let i = 0; i < startIdx; i++) {
    const { stage, contextKey, isBrainstorm } = PIPELINE[i];
    if (isBrainstorm) {
      if (fs.existsSync(cfg.brainstormFile)) {
        context = { ...context, brainstorm: fs.readFileSync(cfg.brainstormFile, "utf-8") };
      }
      continue;
    }
    if (contextKey) {
      const output = readOutputArtifact(stage, cfg);
      if (output) context = { ...context, [contextKey]: output };
    }
  }

  for (let i = startIdx; i < PIPELINE.length; i++) {
    const { stage, contextKey, requiresApproval, isBrainstorm, usesWorktree } = PIPELINE[i];
    updateCurrentStage(stage, cfg);
    appendEvent(cfg, "stage_start", stage);

    if (isBrainstorm) {
      const result = await runBrainstormStage(workspace, context, cfg);
      if (result) {
        const { brainstormMd, candidateSkills } = result;
        const brainstormSkills = candidateSkills.length > 0
          ? `Brainstorm identified these candidate skills: ${candidateSkills.join(", ")}\nRefine this list based on the full spec and task plan. Do not blindly include all of them.`
          : "";
        context = { ...context, brainstorm: brainstormMd, brainstormSkills, candidateSkills };
      }
      appendEvent(cfg, "stage_complete", stage);
      continue;
    }

    // Set up worktree before the first worktree stage (build), if not already active
    if (usesWorktree && !context.featureBranch) {
      const branch = setupWorktree(workspace, cfg);
      if (branch) {
        persistWorktreeBranch(branch, cfg);
        context = { ...context, featureBranch: branch, execWorkspace: cfg.worktreePath };
        appendEvent(cfg, "worktree_setup", stage, { branch });
        console.log(`🌿 Worktree created: ${branch}`);
      }
    }

    // Inject handoff into build (prior failed run) and test (build output) stages
    if ((stage === "build" || stage === "test") && !context.handoff) {
      const handoff = loadHandoff(cfg);
      if (handoff) {
        context = { ...context, handoff };
        if (stage === "build") console.log("📋 Prior handoff context injected into build stage.");
        appendEvent(cfg, "handoff_injected", stage);
      }
    }

    runStage(stage, workspace, context, cfg);

    const output = readOutputArtifact(stage, cfg);
    if (output) {
      if (stage === "plan") {
        writePlanArtifacts(cfg, output);
        const selectedSkills = extractSelectedSkills(output);
        if (selectedSkills.length > 0) {
          console.log(`🎯 Selected skills: ${selectedSkills.join(", ")}`);
          persistSelectedSkills(selectedSkills, cfg);
          context = { ...context, selectedSkills };
          appendEvent(cfg, "skills_selected", stage, { skills: selectedSkills });
        } else {
          console.warn("⚠  No SELECTED_SKILLS found in plan — build/test will use base skills only.");
        }
      }
      if (stage === "build") writeHandoffArtifact(cfg, output);
      if (stage === "review") printReviewSummary(output);
      if (contextKey) context = { ...context, [contextKey]: output };
    }

    appendEvent(cfg, "stage_complete", stage);

    if (stage === "review") {
      const pass = isReviewPass(output);
      appendEvent(cfg, "review_verdict", stage, { verdict: pass ? "pass" : "fail" });
      if (!pass) {
        let task;
        try { task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8")); } catch { task = {}; }
        const retryLimit = task.retry_limit ?? 3;
        const fixAttempts = task.fix_attempts ?? 0;

        if (fixAttempts >= retryLimit) {
          console.log(`⛔ Review failed after ${retryLimit} fix attempt(s). Human intervention required.`);
          task.human_required = true;
          fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
          process.exit(1);
        }

        task.fix_attempts = fixAttempts + 1;
        fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));

        console.log(`\n🔧 Review FAIL — running targeted fix (attempt ${fixAttempts + 1}/${retryLimit})...`);
        appendEvent(cfg, "stage_start", "fix");
        runStage("fix", workspace, context, cfg);
        appendEvent(cfg, "stage_complete", "fix");

        console.log(`\n🧪 Re-running test after fix...`);
        appendEvent(cfg, "stage_start", "test");
        runStage("test", workspace, context, cfg);
        const fixTestOutput = readOutputArtifact("test", cfg);
        if (fixTestOutput) context = { ...context, test: fixTestOutput };
        appendEvent(cfg, "stage_complete", "test");

        console.log(`\n🔍 Re-running review...`);
        updateCurrentStage("review", cfg);
        i--;
        continue;
      }
      // Review passed — reset fix attempt counter for this run
      try {
        const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
        task.fix_attempts = 0;
        fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
      } catch { /* non-fatal */ }
    }

    if (requiresApproval) {
      const approved = await promptApproval(stage, cfg);
      appendEvent(cfg, "approval", stage, { approved });
      if (!approved) {
        console.log(`⛔ Pipeline stopped at ${stage}. Edit .spiq/req.md and re-run.`);
        process.exit(0);
      }
    }
  }

  updateCurrentStage("complete", cfg);
  appendEvent(cfg, "pipeline_complete", null);

  try {
    const vaultFile = persistSession(workspace, cfg);
    console.log(`📦 Session archived → ${vaultFile}`);
  } catch (err) {
    console.warn(`⚠  Session archive skipped: ${err.message}`);
  }

  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Clean .spiq/ for next run? [y/N] ", (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() === "y") {
        resetWorkspace(workspace, cfg);
        console.log(".spiq/ reset to initial state.");
      } else {
        console.log(".spiq/ kept as-is.");
      }
      console.log("✅ Pipeline complete.");
      resolve();
    });
  });
}

module.exports = { runStage, runPipeline };

if (require.main === module) {
  const { parseArgs } = require("node:util");
  const { values } = parseArgs({
    options: { workspace: { type: "string" } },
  });

  if (!values.workspace) {
    console.error("Usage: node orchestrator/orchestrator.js --workspace <path>");
    process.exit(1);
  }

  runPipeline(values.workspace).catch(err => {
    console.error("Pipeline error:", err.message);
    process.exit(1);
  });
}
