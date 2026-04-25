---
name: web-artifacts
description: Produce clean, self-contained, deployable web files. Use when the deliverable is a static web page, single-file HTML application, or zero-dependency frontend. Use when output must open via file:// with no server, bundler, or framework dependency.
---

# Web Artifacts

## Overview

A web artifact is a complete, deployable web deliverable. The gold standard for simple projects is a self-contained output that opens correctly with `open index.html` — no npm install, no build step, no server. This guide defines what clean web artifacts look like and how to produce them.

## When to Use

- Delivering a static web page, prototype, or demo
- Building a single-file HTML tool or widget
- Creating any frontend that should work without a runtime environment
- Packaging frontend output for handoff or review

---

## File Structure Standards

### Minimal (single-page)

```
project/
├── index.html        ← entry point; links to style.css and script.js
├── style.css         ← all styles
└── script.js         ← all JavaScript
```

### Multi-page static site

```
project/
├── index.html
├── about.html
├── assets/
│   ├── style.css
│   ├── script.js
│   └── images/
│       └── hero.webp
└── favicon.ico
```

### Rules

- `index.html` is always the entry point
- CSS lives in `.css` files, not `<style>` tags (except critical-path CSS)
- JavaScript lives in `.js` files, not `<script>` inline blocks (except one-liners)
- No inline event handlers (`onclick=""`, `onload=""`)
- All asset paths are **relative** (never absolute `/path` or `file://`)

---

## The Self-Contained Test

Every artifact must pass before delivery:

```bash
# 1. Open directly in the browser — no server
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows

# 2. Playwright smoke check — zero network requests, zero console errors
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const externalRequests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => {
    if (!req.url().startsWith('file://')) externalRequests.push(req.url());
  });
  await page.goto('file://' + require('path').resolve('index.html'));
  await page.waitForLoadState('networkidle');
  await browser.close();
  if (errors.length) { console.error('Errors:', errors); process.exit(1); }
  if (externalRequests.length) { console.warn('External requests:', externalRequests); }
  console.log('Self-contained check passed');
})();
"
```

---

## HTML Artifact Template

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <!-- Prevent flash of wrong theme -->
  <script>
    (function() {
      const t = localStorage.getItem('theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = t;
    })();
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="[Brief page description]">
  <title>[Page Title]</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <header>
    <nav aria-label="Main">
      <!-- navigation -->
    </nav>
  </header>

  <main>
    <!-- primary content -->
  </main>

  <footer>
    <!-- footer content -->
  </footer>

  <script src="script.js"></script>
</body>
</html>
```

---

## Asset Handling

### Images

- Prefer SVG for icons and illustrations (scales perfectly, zero weight)
- Use WebP for photographs (smaller than JPEG, widely supported)
- Provide `width` and `height` attributes on all `<img>` to prevent layout shift
- Use `loading="lazy"` on below-the-fold images

```html
<img
  src="assets/images/hero.webp"
  alt="Descriptive text"
  width="800"
  height="450"
  loading="lazy"
>
```

### Fonts

Avoid external font CDNs in self-contained artifacts. Use the system font stack:

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, Oxygen, Ubuntu, sans-serif;
```

If a custom font is required, embed it as a base64 data URI in the CSS, or bundle the font file alongside the artifact.

### Icons

Prefer inline SVG over icon fonts or external icon libraries:

```html
<!-- Inline SVG icon — no external dependency -->
<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" aria-hidden="true">
  <polyline points="20 6 9 17 4 12"/>
</svg>
```

---

## Output Quality Gates

Every web artifact must pass all of these before delivery:

### Functional

- [ ] Opens correctly via `open index.html` (no server)
- [ ] All navigation links work
- [ ] All interactive elements respond to click and keyboard
- [ ] No broken images or missing assets (check DevTools Network tab or Playwright)
- [ ] No JavaScript errors in the console

### Visual

- [ ] Renders correctly at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] No horizontal scrollbar at any breakpoint
- [ ] Text is legible at default zoom
- [ ] Images load and display correctly

### Code Quality

- [ ] HTML validates (`npx htmlhint **/*.html`)
- [ ] No inline styles (except generated values)
- [ ] No inline event handlers
- [ ] All external resources are local (no CDN calls unless spec allows it)
- [ ] CSS uses custom properties for all variable values

### Accessibility

- [ ] All images have `alt` text
- [ ] All form inputs have `<label>`
- [ ] All interactive elements are keyboard-reachable
- [ ] Heading hierarchy is correct (no skipped levels)
- [ ] Page is usable without a mouse

---

## Delivery Checklist

When handing off a web artifact:

```markdown
## Artifact: [Project Name]

**Entry point:** index.html (open directly in browser)
**Files:** [list all deliverables]
**Browser tested:** Chrome / Firefox / Safari
**Viewports tested:** 375px, 768px, 1280px

### Self-Contained Check
- [ ] No external network requests
- [ ] Works via file:// protocol
- [ ] Zero console errors

### Validation
- [ ] HTML: htmlhint passed
- [ ] Playwright smoke check: passed

### Known Limitations
[Any intentional trade-offs or out-of-scope items]
```
