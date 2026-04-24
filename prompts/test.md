---
description: Run TDD workflow — write failing tests, implement, verify. For bugs, use the Prove-It pattern.
---

{{SKILLS}}

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
1. Serve the page locally (e.g. `npx serve .` or `python3 -m http.server`) or use a `file://` path
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
