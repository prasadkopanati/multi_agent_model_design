---
description: Run TDD workflow — write failing tests, implement, verify. For bugs, use the Prove-It pattern.
---

**Context budget — follow these rules on every command or costs spiral:**
- **Start here:** Read `.spiq/handoff.md` first — it contains the file manifest and test targets from the build stage. Do NOT explore the workspace structure or run broad globs before reading it.
- Append `2>&1 | tail -50` to all test/build commands. If the output is insufficient to diagnose a failure, re-run with `tail -100` or higher.
- Read skill files only when the task explicitly requires that skill. Each file at most once.
- Read source files using `offset` + `limit` parameters — never the entire file unless you are about to write to it.

{{SKILLS}}

## Build Handoff

{{HANDOFF}}

For new features:
1. Write tests that describe the expected behavior (they should FAIL)
2. Implement the code to make them pass
3. Refactor while keeping tests green

For bug fixes (Prove-It pattern):
1. Write a test that reproduces the bug (must FAIL)
2. Confirm the test fails
3. Implement the fix
4. Confirm the test passes
5. Run the full test suite for regressions

For frontend/browser output (any HTML, CSS, or JS files):
1. Serve the page locally or use a `file://` path. When starting a background server, **always redirect output** so the process fully detaches:
   ```bash
   python3 -m http.server 8000 > /dev/null 2>&1 &
   SERVER_PID=$!
   # ... run tests ...
   kill $SERVER_PID 2>/dev/null
   ```
   Without `> /dev/null 2>&1`, the background process keeps stdout/stderr pipes open and the bash tool hangs until timeout.
2. Run a Playwright smoke check to verify real browser rendering:
   - If a `playwright.config.*` exists: `npx playwright test`
   - Otherwise, run an inline smoke script:
     ```js
     // smoke.js
     const { chromium } = require('playwright');
     (async () => {
       const browser = await chromium.launch();
       const page = await browser.newPage();
       const errors = [];
       page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
       page.on('pageerror', e => errors.push(e.message));
       await page.goto('file://' + require('path').resolve('index.html'));
       await page.waitForLoadState('networkidle');
       await browser.close();
       if (errors.length) { console.error('Browser errors:', errors); process.exit(1); }
       console.log('Browser smoke check passed');
     })();
     ```
     then run: `npx playwright --version > /dev/null && node smoke.js`
3. Report any console errors, missing assets, or layout failures as test failures
4. Do NOT fall back to "manual browser verification" — if Playwright is unavailable, report it as a blocked test

For browser-related issues, also invoke agent-skills:browser-testing-with-devtools to verify with Chrome DevTools MCP.
