---
name: content-creation
description: Write clear, effective web content. Use when creating UI copy, page text, microcopy, headings, descriptions, or any user-facing words. Use when content needs to be readable, purposeful, and appropriate to the audience and context.
---

# Content Creation

## Overview

Words are part of the UI. Good copy is invisible — it guides users without making them think. Bad copy creates friction, confusion, and distrust. Write every heading, label, button, and description as if it's the only text the user will read.

## When to Use

- Writing or editing page headings, subheadings, and body text
- Creating button labels, form labels, and placeholder text
- Writing error messages, success messages, and empty states
- Adding descriptions, tooltips, and help text
- Creating `<title>` and `<meta description>` content for SEO

---

## Core Principles

### 1. Lead with the benefit, not the feature

```
✗ "Real-time data synchronization engine"
✓ "Your data stays in sync across all devices"
```

### 2. Use the user's vocabulary, not internal terminology

```
✗ "Initiate a credential reset workflow"
✓ "Reset your password"
```

### 3. Be specific — numbers beat vague claims

```
✗ "Handles large files"
✓ "Supports files up to 5GB"
```

### 4. Active voice over passive

```
✗ "Your request has been submitted"
✓ "We received your request"
```

### 5. Shorter is almost always better

Read what you wrote. Delete every word that doesn't add meaning.

---

## UI Copy Patterns

### Headings

The heading is a promise. The content below must deliver it.

```
✗ "Overview"           → too vague
✓ "How it works"       → describes what follows

✗ "Features"           → internal framing
✓ "What you can do"    → user framing

✗ "Our Solution"       → company-centric
✓ "Build faster with X" → benefit-first
```

Heading hierarchy:
- `<h1>`: What this page is (one per page)
- `<h2>`: Major sections
- `<h3>`: Subsections within a section

### Button Labels

Buttons should complete the sentence: "I want to ___."

```
✗ "Submit"         → vague, what am I submitting?
✓ "Send message"
✓ "Create account"
✓ "Download report"

✗ "OK"             → only valid for dismissing informational dialogs
✗ "Click here"     → never — where am I going?
✗ "Yes" / "No"     → only for binary confirmation dialogs with a clear question
```

Destructive actions must be explicit:

```
✗ "Delete"                 → what am I deleting?
✓ "Delete project"
✓ "Remove from team"
✓ "Permanently delete account"
```

### Form Labels

Labels go above the input (not as placeholder text):

```html
<!-- ✓ Correct -->
<label for="email">Email address</label>
<input id="email" type="email" placeholder="you@example.com">

<!-- ✗ Don't use placeholder as label — disappears on input -->
<input type="email" placeholder="Email address">
```

Label conventions:
- Short, noun-first: "Email address" not "Please enter your email address"
- No punctuation at the end of labels
- Required fields: add "(required)" or use `*` with a legend, not just color

### Placeholder Text

Placeholder shows an example, not a repeat of the label:

```
Label:       "Company name"
Placeholder: "Acme Inc."

Label:       "Search"
Placeholder: "Search by name or ID..."

Label:       "URL"
Placeholder: "https://example.com"
```

### Error Messages

Three parts: what went wrong, why (if helpful), how to fix it.

```
✗ "Invalid input"
✓ "Email address is not valid. Check for typos and try again."

✗ "Error 403"
✓ "You don't have permission to view this page. Contact your admin to request access."

✗ "Something went wrong"
✓ "We couldn't save your changes. Check your connection and try again."
```

Never blame the user:

```
✗ "You entered an invalid password"
✓ "That password doesn't match. Try again or reset your password."
```

### Success Messages

Confirm the action and hint at what's next:

```
✗ "Success!"
✓ "Message sent. You'll hear back within 24 hours."

✗ "Saved"
✓ "Changes saved."

✗ "Done"
✓ "Account created. Check your email to verify."
```

### Empty States

Empty states explain why something is empty and offer a path forward:

```
✗ "No results"
✓ "No projects yet. Create your first project to get started."

✗ "No data"
✓ "Nothing matches your search. Try different keywords or clear your filters."
```

---

## Page-Level Content

### `<title>` Tag

```html
<!-- Format: [Page Name] — [Site Name] -->
<title>Settings — Acme Dashboard</title>

<!-- Home page: just the site name and tagline -->
<title>Acme — Ship faster with AI</title>
```

Rules:
- 50–60 characters maximum (Google truncates at ~60)
- Most specific first: Page → Section → Site
- No "Welcome to" or "Home of"

### `<meta name="description">`

```html
<meta name="description" content="Acme helps teams ship software 3x faster with AI-assisted code review and automated testing. Start free, no credit card required.">
```

Rules:
- 120–155 characters (Google truncates at ~155)
- Describes the page, not the site
- Include a value proposition or call to action where natural
- No keyword stuffing

### Hero Copy

```
Headline:    Short, bold, benefit-first (6–10 words ideal)
Subheadline: One sentence expanding the headline — who it's for and what it does
CTA button:  Specific action (not "Get started" — "Start building free")
```

Example:

```html
<h1>Ship software that works, every time</h1>
<p>AI-powered code review that catches bugs before your users do.</p>
<a href="/signup" class="btn btn--primary">Start for free — no card needed</a>
```

---

## Tone and Voice

### Tone calibration by context

| Context | Tone | Example |
|---|---|---|
| Marketing / landing page | Confident, energetic | "Build the future." |
| App UI | Clear, neutral, direct | "Select a file to upload." |
| Error message | Calm, helpful, never alarming | "Couldn't connect. Check your network." |
| Success / confirmation | Warm, brief | "Done! Your file is ready." |
| Destructive confirmation | Serious, explicit | "This will permanently delete all data." |
| Empty state | Encouraging, action-oriented | "No tasks yet. Add your first one." |

### What to avoid

- **Filler words:** "Please note that...", "It's worth mentioning...", "Feel free to..."
- **Overpromising:** "Amazing!", "Incredible!", "Revolutionary!"
- **Hedging:** "Try to...", "You might want to...", "It may be helpful to..."
- **Jargon:** Internal terms, product codenames, or technical acronyms in user-facing copy
- **Passive aggression:** "You must agree to the terms before continuing" → "Agree to continue"

---

## Readability Standards

For body text and longer descriptions:

- Sentence length: aim for under 20 words per sentence
- Paragraph length: 2–4 sentences maximum on the web
- Reading level: write for a 10th-grade reading level (Flesch-Kincaid)
- Use lists when enumerating 3+ items instead of run-on sentences

```
✗ "Our platform offers real-time collaboration, version control, automated
    testing, deployment pipelines, and monitoring dashboards."

✓ "Our platform includes:
    - Real-time collaboration
    - Version control
    - Automated testing and deployment
    - Monitoring dashboards"
```

---

## Verification

Before shipping any user-facing text:

- [ ] Every button label completes "I want to ___"
- [ ] No placeholder text used as a label substitute
- [ ] All error messages include how to fix the problem
- [ ] Empty states offer an action path
- [ ] `<title>` is under 60 characters and page-specific
- [ ] `<meta description>` is 120–155 characters
- [ ] No "Click here" links (use descriptive link text)
- [ ] No lorem ipsum placeholder text remains
- [ ] Read all copy aloud — anything that sounds awkward, rewrite it
