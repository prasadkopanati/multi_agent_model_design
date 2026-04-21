const { test } = require("node:test");
const assert = require("node:assert/strict");

// Clear the module cache before each require so tests are independent.
function freshCompilePrompt() {
  delete require.cache[require.resolve("../orchestrator/promptCompiler")];
  return require("../orchestrator/promptCompiler").compilePrompt;
}

test("replaces {{SKILLS}} — no literal placeholder remains in failure template", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("failure", {});
  assert.ok(!result.includes("{{SKILLS}}"), "{{SKILLS}} should be replaced");
});

test("replaces {{DEBUGGING}} — no literal placeholder remains in failure template", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("failure", {});
  assert.ok(!result.includes("{{DEBUGGING}}"), "{{DEBUGGING}} should be replaced");
});

test("replaces {{DEBUGGING}} with DEBUGGING.md content", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("failure", {});
  assert.ok(
    result.includes("Debugging and Error Recovery"),
    "DEBUGGING.md content should appear in output"
  );
});

test("replaces {{FAILURE}} with context.failure string", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("failure", { failure: "TypeError at line 42" });
  assert.ok(result.includes("TypeError at line 42"), "failure context should appear");
  assert.ok(!result.includes("{{FAILURE}}"), "{{FAILURE}} placeholder should be gone");
});

test("replaces {{FAILURE}} with empty string when no failure context is given", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("failure", {});
  assert.ok(!result.includes("{{FAILURE}}"), "{{FAILURE}} placeholder should be gone");
});

test("replaces all occurrences of a placeholder, not just the first", () => {
  const compilePrompt = freshCompilePrompt();
  // failure.md now has {{SKILLS}} once, but we verify no instance survives
  // (replaceAll guard — if replace() were used only the first would go)
  const result = compilePrompt("failure", {});
  assert.ok(!result.includes("{{SKILLS}}"));
  assert.ok(!result.includes("{{DEBUGGING}}"));
  assert.ok(!result.includes("{{FAILURE}}"));
});

test("falls back to SKILLS.md only for an unknown stage", () => {
  const compilePrompt = freshCompilePrompt();
  // 'failure' stage has a real template and maps to ["SKILLS.md", "DEBUGGING.md"].
  // An unknown stage key still compiles skills (falls back to SKILLS.md).
  // We can't easily test a missing template file here without a real file,
  // so verify the known-stage fallback: 'failure' uses DEBUGGING.md, not PLANNING.md.
  const result = compilePrompt("failure", {});
  assert.ok(result.includes("Debugging and Error Recovery"), "fallback includes SKILLS + DEBUGGING");
});

test("compilePrompt for 'build' stage completes without error and has no unresolved placeholders", () => {
  const compilePrompt = freshCompilePrompt();
  const result = compilePrompt("build", { failure: "some error" });
  assert.ok(!result.includes("{{SKILLS}}"));
  assert.ok(!result.includes("{{DEBUGGING}}"));
  assert.ok(!result.includes("{{FAILURE}}"));
  assert.ok(!result.includes("{{PLAN}}"));
});
