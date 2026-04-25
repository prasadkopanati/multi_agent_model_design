---
name: web-development
description: Build semantic, accessible, responsive web pages. Use when creating or modifying any HTML, CSS, or client-side JavaScript. Use when building static sites, landing pages, dashboards, or any browser-rendered output.
---

# Web Development

## Overview

Write web pages that are semantic, accessible, responsive, and self-contained. Prefer zero-dependency static output over build-toolchain complexity. Every HTML file should open correctly in a browser with no server, no bundler, and no framework unless the spec explicitly requires one.

## When to Use

- Creating or modifying HTML, CSS, or vanilla JavaScript files
- Building static sites, single-page demos, or dashboards
- Adding interactivity without a framework
- Ensuring cross-browser compatibility and mobile responsiveness

**When NOT to use:** Framework-specific component work (React, Vue, Svelte) — follow that framework's conventions instead.

---

## HTML: Write Semantic Markup

Use the element that best describes the content, not the one that looks right by default.

```html
<!-- Good: semantically correct -->
<nav aria-label="Main">...</nav>
<main>
  <article>
    <h1>Title</h1>
    <p>Content</p>
  </article>
</main>
<footer>...</footer>

<!-- Bad: div soup -->
<div class="nav">...</div>
<div class="main">
  <div class="article">
    <div class="title">Title</div>
  </div>
</div>
```

### Element Selection Guide

| Content type | Element |
|---|---|
| Primary page landmark | `<main>` |
| Navigation links | `<nav>` |
| Standalone content unit | `<article>` |
| Related content group | `<section>` (needs a heading) |
| Supplementary content | `<aside>` |
| Page-level heading | `<h1>` (one per page) |
| Interactive control | `<button>` (not `<div onclick>`) |
| Form input label | `<label for="id">` (always paired) |
| Image with meaning | `<img alt="descriptive text">` |
| Decorative image | `<img alt="">` (empty, not absent) |

### Document Structure Checklist

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Page description for SEO">
  <title>Page Title — Site Name</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>...</header>
  <nav>...</nav>
  <main>...</main>
  <footer>...</footer>
  <script src="script.js"></script>  <!-- scripts at end of body -->
</body>
</html>
```

---

## CSS: Architecture with Custom Properties

### Custom Properties for All Variable Values

Define every color, spacing, and font value as a CSS custom property. Never hardcode values in rules.

```css
/* ✓ Define all tokens in :root */
:root {
  /* Colors */
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-text: #e8e8e8;
  --color-text-muted: #888;
  --color-accent: #4f9eff;
  --color-accent-hover: #6aafff;

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;

  /* Typography */
  --font-body: system-ui, -apple-system, sans-serif;
  --font-mono: 'Courier New', monospace;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;

  /* Layout */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
}
```

### BEM-ish Class Naming

```css
/* Block */
.card { ... }

/* Element */
.card__title { ... }
.card__body { ... }
.card__footer { ... }

/* Modifier */
.card--featured { ... }
.card--compact { ... }

/* State (prefer data attributes for JS-toggled state) */
.card[data-selected="true"] { ... }
.card[aria-expanded="true"] { ... }
```

### Layout Patterns

```css
/* Responsive grid — no media query needed */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-lg);
}

/* Flex row with wrapping */
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: center;
}

/* Centered container */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-lg);
}

/* Full-height section */
.hero {
  min-height: 100svh;
  display: flex;
  align-items: center;
}
```

### Animation Rules

Only animate `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, or `margin` — they trigger layout reflow.

```css
/* ✓ Correct: compositor-only properties */
.card {
  transition: transform 200ms ease, opacity 200ms ease;
}
.card:hover {
  transform: translateY(-4px);
}

/* ✗ Wrong: triggers layout */
.card:hover {
  margin-top: -4px;
}
```

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## JavaScript: Vanilla Patterns

### Event Delegation

Use one listener on the container, not N listeners on N children.

```js
// ✓ One listener handles all .item clicks
document.querySelector('.list').addEventListener('click', e => {
  const item = e.target.closest('.item');
  if (!item) return;
  handleItemClick(item);
});

// ✗ N listeners
document.querySelectorAll('.item').forEach(el => {
  el.addEventListener('click', handleItemClick);
});
```

### Data-First Architecture

Keep all data in a constant or module. The DOM reflects data — the DOM is not the data.

```js
const ITEMS = [
  { id: 'a', label: 'Alpha', value: 1 },
  { id: 'b', label: 'Beta',  value: 2 },
];

function render(items) {
  return items.map(item => `
    <div class="item" data-id="${item.id}">
      <span class="item__label">${item.label}</span>
    </div>
  `).join('');
}

document.querySelector('.list').innerHTML = render(ITEMS);
```

### DOM Queries

```js
// Cache queries — don't re-query the same element repeatedly
const panel = document.querySelector('#panel');
const items = document.querySelectorAll('.item');  // NodeList, not Array

// Convert to Array when you need array methods
const itemArray = Array.from(items);

// Null-guard before using
const btn = document.querySelector('#submit');
btn?.addEventListener('click', handleSubmit);
```

### Keyboard and Accessibility

```js
// Support both click and keyboard for all interactions
element.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleAction();
  }
  if (e.key === 'Escape') {
    handleClose();
  }
});
```

---

## Responsive Design

### Mobile-First Breakpoints

```css
/* Base: mobile (no media query) */
.grid { grid-template-columns: 1fr; }

/* Tablet */
@media (min-width: 640px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop */
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
```

### Touch Targets

Minimum 44×44px for all interactive elements on mobile.

```css
.btn, button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
  padding: var(--space-sm) var(--space-md);
}
```

---

## Accessibility Baseline

Every page must pass this baseline before shipping:

```
[ ] One <h1> per page; heading levels don't skip (h1 → h2 → h3)
[ ] All images have alt text (descriptive, or "" if decorative)
[ ] All form inputs have associated <label for="id">
[ ] All interactive elements reachable by Tab key
[ ] Focus indicator is visible (never outline: none without replacement)
[ ] Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text
[ ] No information conveyed by color alone
[ ] Buttons use <button>, links use <a href>
[ ] Dynamic content updates announced via aria-live where needed
[ ] Page usable at 200% browser zoom
```

---

## Verification

Before marking any web output complete:

```bash
# HTML validation
npx htmlhint **/*.html

# No console errors
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + require('path').resolve('index.html'));
  await p.waitForLoadState('networkidle');
  await b.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Clean');
})();
"
```

- [ ] Opens correctly via `file://` (no server required)
- [ ] Zero console errors or warnings
- [ ] Responsive at 375px, 768px, and 1280px widths
- [ ] All interactive elements keyboard-accessible
- [ ] HTML validates with no errors
- [ ] Passes accessibility baseline above
