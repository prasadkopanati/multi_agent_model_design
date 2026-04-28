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

const STAGE_SKILLS = {
  spec:    ["SKILLS.md", "SPEC_CEO_CHALLENGE.md", "SPEC_DRIVEN.md", "BRAINSTORMING.md"],
  plan:    ["SKILLS.md", "PLANNING.md", "TEST_DRIVEN.md", "PLAN_QUALITY_GATE.md", "DISPATCHING_PARALLEL_AGENTS.md"],
  build:   ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md", "WIP_CHECKPOINT.md", "WEB_DEV.md", "THEME_FACTORY.md", "WEB_ARTIFACTS.md", "CONTENT_CREATION.md", "API_DESIGN.md", "DATABASE.md", "DOCKER.md", "PDF.md", "GIT.md", "REQUESTING_CODE_REVIEW.md", "EXECUTION_DISCIPLINE.md", "BUILD_HANDOFF_SUMMARY.md"],
  test:    ["SKILLS.md", "TEST_DRIVEN.md", "REGRESSION_GUARD.md", "BROWSER_TESTING.md", "WEB_DEV.md", "WEB_ARTIFACTS.md", "API_TESTING.md", "VERIFICATION_BEFORE_COMPLETION.md", "WIP_CHECKPOINT.md", "BUILD_HANDOFF_SUMMARY.md"],
  review:  ["SKILLS.md", "CODE_REVIEW.md", "SECURITY.md", "PERFORMANCE.md", "RECEIVING_CODE_REVIEW.md"],
  finish:  ["SKILLS.md", "FINISHING_BRANCH.md", "SPEC_TRACED_DELIVERY.md", "PIPELINE_INTEGRITY_CHECK.md", "DOCUMENTATION_RELEASE.md", "POST_DEPLOY_CANARY.md"],
  failure: ["SKILLS.md", "FAILURE_INVESTIGATION.md", "DEBUGGING.md", "FAILURE_CONTEXT_CONTINUITY.md"],
};

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
function compileSkills(stage) {
  const files   = STAGE_SKILLS[stage] || ["SKILLS.md"];
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

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(path.join(PROMPTS_DIR, `${stage}.md`), "utf-8");

  template = template.replaceAll("{{SKILLS}}",    compileSkills(stage));
  template = template.replaceAll("{{DEBUGGING}}", load("DEBUGGING.md"));
  template = template.replaceAll("{{REQUEST}}",   context.request  || "");
  template = template.replaceAll("{{FAILURE}}",   context.failure  || "");
  template = template.replaceAll("{{ANALYSIS}}",  context.analysis ? JSON.stringify(context.analysis, null, 2) : "");
  template = template.replaceAll("{{PLAN}}",      context.plan     || "");
  template = template.replaceAll("{{SPEC}}",      context.spec     || "");
  template = template.replaceAll("{{BUILD}}",     context.build    || "");
  template = template.replaceAll("{{TEST}}",      context.test     || "");
  template = template.replaceAll("{{REVIEW}}",    context.review   || "");
  template = template.replaceAll("{{SPEC_FILE}}",  context.specFile  || "SPEC.md");
  template = template.replaceAll("{{PLAN_FILE}}",  context.planFile  || "tasks/plan.md");
  template = template.replaceAll("{{PLAN_DIR}}",   context.planDir   || "tasks");

  return template;
}

module.exports = { compilePrompt, stripFrontmatter };
