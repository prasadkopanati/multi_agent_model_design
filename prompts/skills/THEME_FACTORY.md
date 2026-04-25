---
name: theme-factory
description: Create scalable CSS design token systems and themes. Use when building a design system, implementing light/dark mode, creating brand themes, or generating reusable style foundations. Use when a project needs consistent visual language across components.
---

# Theme Factory

## Overview

A theme is a set of named design tokens — colors, spacing, type, radius, shadow — that every component draws from. Build themes as CSS custom property systems so a single class swap on `<html>` changes the entire visual language with zero JavaScript logic.

## When to Use

- Starting a new web project (build the token system first)
- Implementing light/dark mode toggle
- Creating brand variants or white-label skins
- Standardizing visual inconsistency across a page or app
- Extracting ad-hoc hardcoded values into a reusable system

---

## Token Hierarchy

Organize tokens in two layers: **primitive** (raw values) and **semantic** (named intent).

```css
/* ─── Layer 1: Primitives — raw values, never used directly in components ─── */
:root {
  /* Palette */
  --primitive-gray-50:  #fafafa;
  --primitive-gray-100: #f5f5f5;
  --primitive-gray-200: #e5e5e5;
  --primitive-gray-800: #262626;
  --primitive-gray-900: #171717;
  --primitive-gray-950: #0a0a0a;

  --primitive-blue-400: #60a5fa;
  --primitive-blue-500: #3b82f6;
  --primitive-blue-600: #2563eb;

  --primitive-red-400:  #f87171;
  --primitive-green-400:#4ade80;

  /* Type scale */
  --primitive-size-xs:  0.75rem;
  --primitive-size-sm:  0.875rem;
  --primitive-size-md:  1rem;
  --primitive-size-lg:  1.125rem;
  --primitive-size-xl:  1.25rem;
  --primitive-size-2xl: 1.5rem;
  --primitive-size-3xl: 1.875rem;
  --primitive-size-4xl: 2.25rem;
}

/* ─── Layer 2: Semantic — intent-named aliases, used in all components ─── */
[data-theme="light"] {
  --color-bg:           var(--primitive-gray-50);
  --color-bg-elevated:  #ffffff;
  --color-surface:      var(--primitive-gray-100);
  --color-border:       var(--primitive-gray-200);
  --color-text:         var(--primitive-gray-900);
  --color-text-muted:   var(--primitive-gray-800);
  --color-accent:       var(--primitive-blue-600);
  --color-accent-hover: var(--primitive-blue-500);
  --color-danger:       var(--primitive-red-400);
  --color-success:      var(--primitive-green-400);
}

[data-theme="dark"] {
  --color-bg:           var(--primitive-gray-950);
  --color-bg-elevated:  var(--primitive-gray-900);
  --color-surface:      var(--primitive-gray-800);
  --color-border:       #2a2a2a;
  --color-text:         #e8e8e8;
  --color-text-muted:   #aaa;
  --color-accent:       var(--primitive-blue-400);
  --color-accent-hover: #93c5fd;
  --color-danger:       var(--primitive-red-400);
  --color-success:      var(--primitive-green-400);
}
```

---

## Complete Token Set Template

Copy this as the starting token system for any new project:

```css
:root {
  /* ── Spacing ── */
  --space-1:  0.25rem;   /*  4px */
  --space-2:  0.5rem;    /*  8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */

  /* ── Border radius ── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg:  0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
  --shadow-xl:  0 20px 25px rgba(0,0,0,0.15);

  /* ── Typography ── */
  --font-sans:  system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:  ui-monospace, 'Cascadia Code', 'Courier New', monospace;
  --font-serif: Georgia, 'Times New Roman', serif;

  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  1.875rem;  /* 30px */
  --text-4xl:  2.25rem;   /* 36px */

  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-loose:  1.75;

  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  /* ── Animation ── */
  --duration-fast:   100ms;
  --duration-normal: 200ms;
  --duration-slow:   350ms;
  --ease-out:        cubic-bezier(0.0, 0, 0.2, 1);
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);

  /* ── Z-index scale ── */
  --z-base:    0;
  --z-raised:  10;
  --z-overlay: 100;
  --z-modal:   200;
  --z-toast:   300;
}
```

---

## Light/Dark Mode Toggle

### HTML — attribute-based (preferred)

```html
<html data-theme="dark">
```

```js
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  localStorage.setItem('theme', next);
}

// Restore on load — put this in <head> to prevent flash
const saved = localStorage.getItem('theme');
const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = saved || preferred;
```

### Flash-of-Wrong-Theme Prevention

Inline this script in `<head>`, before any stylesheets load:

```html
<head>
  <script>
    (function() {
      const t = localStorage.getItem('theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = t;
    })();
  </script>
  <link rel="stylesheet" href="style.css">
</head>
```

---

## Brand Themes

For multi-brand or white-label use, add a second dimension:

```css
/* Base theme tokens (dark) */
[data-theme="dark"] { ... }

/* Brand A overlay — only overrides accent/brand tokens */
[data-brand="alpha"] {
  --color-accent:       #f59e0b;
  --color-accent-hover: #fbbf24;
  --color-accent-text:  #000;
}

[data-brand="beta"] {
  --color-accent:       #8b5cf6;
  --color-accent-hover: #a78bfa;
  --color-accent-text:  #fff;
}
```

Apply to `<html>`:
```html
<html data-theme="dark" data-brand="alpha">
```

---

## Component Tokens

For complex components, add component-scoped tokens that map to global tokens:

```css
.btn {
  /* Component tokens — only reference semantic globals */
  --btn-bg:         var(--color-accent);
  --btn-bg-hover:   var(--color-accent-hover);
  --btn-text:       #fff;
  --btn-radius:     var(--radius-md);
  --btn-padding:    var(--space-2) var(--space-4);
  --btn-font-size:  var(--text-sm);
  --btn-weight:     var(--weight-semibold);

  background: var(--btn-bg);
  color: var(--btn-text);
  border-radius: var(--btn-radius);
  padding: var(--btn-padding);
  font-size: var(--btn-font-size);
  font-weight: var(--btn-weight);
  transition: background var(--duration-normal) var(--ease-out);
}

.btn:hover { background: var(--btn-bg-hover); }

/* Variant — override component tokens, not globals */
.btn--ghost {
  --btn-bg:       transparent;
  --btn-bg-hover: var(--color-surface);
  --btn-text:     var(--color-accent);
  border: 1px solid currentColor;
}
```

---

## Generating Theme Variants Programmatically

When creating multiple color themes from a single brand hue:

```js
// Given: a base hue (0-360), generate a full dark theme palette
function generatePalette(hue) {
  return {
    bg:       `hsl(${hue}, 10%, 6%)`,
    surface:  `hsl(${hue}, 10%, 11%)`,
    border:   `hsl(${hue}, 10%, 18%)`,
    text:     `hsl(${hue}, 5%, 91%)`,
    muted:    `hsl(${hue}, 5%, 60%)`,
    accent:   `hsl(${hue}, 85%, 65%)`,
    accentHover: `hsl(${hue}, 85%, 72%)`,
  };
}

// Output as CSS custom properties
function toCSSVars(palette) {
  return Object.entries(palette)
    .map(([k, v]) => `  --color-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
    .join('\n');
}
```

---

## Verification

- [ ] All component styles reference tokens, no hardcoded color/spacing values
- [ ] Both `[data-theme="light"]` and `[data-theme="dark"]` defined and tested
- [ ] No flash of wrong theme on page load
- [ ] Theme toggle persists across page refresh (localStorage)
- [ ] Respects `prefers-color-scheme` on first visit
- [ ] Color contrast meets 4.5:1 in both themes (body text)
- [ ] All interactive states (hover, focus, active, disabled) defined using tokens
