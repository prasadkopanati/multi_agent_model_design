const fs = require("fs");

function load(file) {
  return fs.readFileSync(`prompts/skills/${file}`, "utf-8");
}

function compileSkills(stage) {
  const stageSkills = {
    spec: ["SKILLS.md", "SPEC_DRIVEN.md"],
    plan: ["SKILLS.md", "PLANNING.md"],
    build: ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md"],
    test: ["SKILLS.md", "TEST_DRIVEN.md", "BROWSER_TESTING.md"],
    review: ["SKILLS.md", "CODE_REVIEW.md", "SECURITY.md", "PERFORMANCE.md"]
  };

  const skillFiles = stageSkills[stage] || ["SKILLS.md"];
  return skillFiles.map(load).join("\n\n");
}

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(`prompts/${stage}.md`, "utf-8");

  template = template.replace("{{SKILLS}}", compileSkills(stage));
  template = template.replace("{{FAILURE}}", context.failure || "");
  template = template.replace("{{PLAN}}", context.plan || "");

  return template;
}

module.exports = { compilePrompt };
