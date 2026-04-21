const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(__dirname, "..", "prompts", "skills");
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

function load(file) {
  return fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
}

const STAGE_SKILLS = {
  spec:    ["SKILLS.md", "SPEC_DRIVEN.md"],
  plan:    ["SKILLS.md", "PLANNING.md"],
  build:   ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md"],
  test:    ["SKILLS.md", "TEST_DRIVEN.md", "BROWSER_TESTING.md"],
  review:  ["SKILLS.md", "CODE_REVIEW.md", "SECURITY.md", "PERFORMANCE.md"],
  failure: ["SKILLS.md", "DEBUGGING.md"],
};

function compileSkills(stage) {
  const skillFiles = STAGE_SKILLS[stage] || ["SKILLS.md"];
  return skillFiles.map(load).join("\n\n");
}

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(path.join(PROMPTS_DIR, `${stage}.md`), "utf-8");

  template = template.replaceAll("{{SKILLS}}",    compileSkills(stage));
  template = template.replaceAll("{{DEBUGGING}}", load("DEBUGGING.md"));
  template = template.replaceAll("{{FAILURE}}",   context.failure  || "");
  template = template.replaceAll("{{ANALYSIS}}",  context.analysis ? JSON.stringify(context.analysis, null, 2) : "");
  template = template.replaceAll("{{PLAN}}",      context.plan     || "");
  template = template.replaceAll("{{SPEC}}",      context.spec     || "");
  template = template.replaceAll("{{BUILD}}",     context.build    || "");
  template = template.replaceAll("{{TEST}}",      context.test     || "");

  return template;
}

module.exports = { compilePrompt };
