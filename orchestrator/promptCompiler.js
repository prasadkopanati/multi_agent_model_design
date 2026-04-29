const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(__dirname, "..", "prompts", "skills");
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function load(file) {
  return stripFrontmatter(fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8"));
}

// Skills that are always loaded for a stage regardless of task type.
const BASE_SKILLS = {
  brainstorm: ["SKILLS.md", "INTERACTIVE_CLARIFICATION.md"],
  spec:    ["SKILLS.md", "SPEC_CEO_CHALLENGE.md", "SPEC_DRIVEN.md", "BRAINSTORMING.md"],
  plan:    ["SKILLS.md", "RESEARCH.md", "PLANNING.md", "TEST_DRIVEN.md", "PLAN_QUALITY_GATE.md", "DISPATCHING_PARALLEL_AGENTS.md"],
  build:   ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md", "WIP_CHECKPOINT.md", "GIT.md", "REQUESTING_CODE_REVIEW.md", "EXECUTION_DISCIPLINE.md", "BUILD_HANDOFF_SUMMARY.md"],
  test:    ["SKILLS.md", "TEST_DRIVEN.md", "VERIFICATION_BEFORE_COMPLETION.md", "WIP_CHECKPOINT.md", "BUILD_HANDOFF_SUMMARY.md"],
  review:  ["SKILLS.md", "CODE_REVIEW.md", "SECURITY.md", "PERFORMANCE.md", "RECEIVING_CODE_REVIEW.md"],
  finish:  ["SKILLS.md", "FINISHING_BRANCH.md", "SPEC_TRACED_DELIVERY.md", "PIPELINE_INTEGRITY_CHECK.md", "DOCUMENTATION_RELEASE.md", "POST_DEPLOY_CANARY.md"],
  failure: ["SKILLS.md", "FAILURE_INVESTIGATION.md", "DEBUGGING.md", "FAILURE_CONTEXT_CONTINUITY.md"],
  fix:     ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "DEBUGGING.md", "GIT.md", "EXECUTION_DISCIPLINE.md"],
};

// Task-type-specific skills. Selected by brainstorm/spec/plan agents and injected into
// build and test stages. Stages that don't use dynamic selection are unaffected.
const SELECTABLE_SKILLS = [
  { id: "WEB_DEV",          file: "WEB_DEV.md",          stages: ["build", "test"], summary: "HTML/CSS/JS web pages, browser-rendered UI, responsive layouts" },
  { id: "API_DESIGN",       file: "API_DESIGN.md",        stages: ["build", "review"], summary: "REST API design, endpoints, request/response contracts, auth" },
  { id: "DATABASE",         file: "DATABASE.md",          stages: ["build"],         summary: "Schema design, migrations, queries, transactions, optimisation" },
  { id: "DOCKER",           file: "DOCKER.md",            stages: ["build"],         summary: "Dockerfiles, docker-compose, containerisation, deployment prep" },
  { id: "PDF",              file: "PDF.md",               stages: ["build"],         summary: "PDF generation, extraction, merging, HTML-to-PDF conversion" },
  { id: "THEME_FACTORY",    file: "THEME_FACTORY.md",     stages: ["build"],         summary: "CSS design tokens, theme systems, light/dark mode, brand styles" },
  { id: "WEB_ARTIFACTS",    file: "WEB_ARTIFACTS.md",     stages: ["build", "test"], summary: "Self-contained static HTML, zero-dependency frontend deliverables" },
  { id: "CONTENT_CREATION", file: "CONTENT_CREATION.md",  stages: ["build"],         summary: "UI copy, headings, microcopy, user-facing text and tone" },
  { id: "BROWSER_TESTING",  file: "BROWSER_TESTING.md",   stages: ["test"],          summary: "DOM inspection, console errors, DevTools-based browser testing" },
  { id: "API_TESTING",      file: "API_TESTING.md",       stages: ["test"],          summary: "HTTP integration tests, request/response contracts, auth flows" },
  { id: "REGRESSION_GUARD", file: "REGRESSION_GUARD.md",  stages: ["test"],          summary: "Regression tests for discovered bugs before fixing" },
];

// Parse name + description from a skill file's frontmatter
function parseFrontmatter(file) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
  const match   = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const name = (match[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (match[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  return (name && desc) ? { name, desc, file } : null;
}

// Build a one-line-per-skill catalog from frontmatter instead of injecting full bodies.
// Full skill content is available at .spiq/skills/ in the workspace (copied by scaffold).
function compileSkills(stage, selectedSkills = []) {
  const base = BASE_SKILLS[stage] || ["SKILLS.md"];

  // Execution stages (build, test) augment base with task-specific selected skills.
  let files = base;
  if (["build", "test"].includes(stage) && selectedSkills.length > 0) {
    const extra = selectedSkills
      .map(id => SELECTABLE_SKILLS.find(s => s.id === id))
      .filter(Boolean)
      .filter(s => s.stages.includes(stage))
      .map(s => s.file);
    files = [...new Set([...base, ...extra])];
  }

  const entries = files
    .map(f => parseFrontmatter(f))
    .filter(Boolean)
    .map(({ name, desc, file }) =>
      `- **${name}** (\`.spiq/skills/${file}\`) — ${desc}`
    );

  return [
    "## Available Skills",
    "",
    "The following skills provide detailed guidance. Read the relevant `.spiq/skills/` file using the `read_file` tool. Do not call `activate_skill` — it does not support these skill names.",
    "",
    entries.join("\n"),
  ].join("\n");
}

// Catalog of selectable skills shown to brainstorm, spec, and plan agents for selection.
function compileSkillCatalog() {
  const rows = SELECTABLE_SKILLS.map(s => {
    const id      = s.id.padEnd(18);
    const summary = s.summary.slice(0, 58).padEnd(58);
    const stages  = s.stages.join(", ");
    return `| ${id} | ${summary} | ${stages} |`;
  });
  return [
    "## Selectable Skills Catalog",
    "",
    "Choose only the skills the task genuinely requires. 4 instead of 2 is fine; 7 instead of 2 is not.",
    "The orchestrator will inject selected skills into build and test stages — and omit everything else.",
    "Use the exact IDs shown in the table.",
    "",
    "| Skill ID           | Purpose                                                    | Stages      |",
    "|--------------------|------------------------------------------------------------| ------------|",
    ...rows,
  ].join("\n");
}

const HANDOFF_CHAR_LIMIT = 2500;
const REVIEW_CHAR_LIMIT  = 4000;

function truncate(text, limit, hint) {
  if (!text || text.length <= limit) return text || "";
  return `${text.slice(0, limit)}\n\n_[Truncated — full content available at ${hint}]_`;
}

function compileHandoff(handoff) {
  return truncate(handoff, HANDOFF_CHAR_LIMIT, "`.spiq/handoff.md`");
}

function compileReview(review) {
  return truncate(review, REVIEW_CHAR_LIMIT, "`.spiq/artifacts/output/review.json`");
}

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(path.join(PROMPTS_DIR, `${stage}.md`), "utf-8");

  template = template.replaceAll("{{SKILLS}}",           compileSkills(stage, context.selectedSkills || []));
  template = template.replaceAll("{{SKILL_CATALOG}}",    compileSkillCatalog());
  template = template.replaceAll("{{DEBUGGING}}",        load("DEBUGGING.md"));
  template = template.replaceAll("{{REQUEST}}",          context.request          || "");
  template = template.replaceAll("{{BRAINSTORM}}",       context.brainstorm       || "");
  template = template.replaceAll("{{BRAINSTORM_SKILLS}}", context.brainstormSkills || "");
  template = template.replaceAll("{{FAILURE}}",          context.failure          || "");
  template = template.replaceAll("{{ANALYSIS}}",         context.analysis ? JSON.stringify(context.analysis, null, 2) : "");
  template = template.replaceAll("{{PLAN}}",             context.plan             || "");
  template = template.replaceAll("{{SPEC}}",             context.spec             || "");
  template = template.replaceAll("{{BUILD}}",            context.build            || "");
  template = template.replaceAll("{{TEST}}",             context.test             || "");
  template = template.replaceAll("{{REVIEW}}",           compileReview(context.review));
  template = template.replaceAll("{{SPEC_FILE}}",        context.specFile         || "SPEC.md");
  template = template.replaceAll("{{PLAN_FILE}}",        context.planFile         || "tasks/plan.md");
  template = template.replaceAll("{{PLAN_DIR}}",         context.planDir          || "tasks");
  template = template.replaceAll("{{HANDOFF}}",          compileHandoff(context.handoff));
  template = template.replaceAll("{{FEATURE_BRANCH}}",   context.featureBranch    || "");

  return template;
}

module.exports = { compilePrompt, stripFrontmatter, SELECTABLE_SKILLS };
