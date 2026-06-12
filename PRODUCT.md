# Mastermind

> Distilled from the user-authored spec (docs/spec/mastermind-first-shot-prompt.md). Source of truth for design context.

register: product

## Product Purpose

A local-first markdown viewer/editor for reviewing and discussing documents with AI coding agents. The loop: agent writes a plan `.md` → the user reads, edits, highlights, and comments with CriticMarkup → Save & hand back → the agent re-reads the file. The file on disk is the protocol; Mastermind is the reviewer-grade reading surface over it.

## Users

- **KD (the owner).** A designer-engineer reviewing agent-written plans several times a day, on a Mac desktop browser, usually in long focused sessions. Bilingual (EN / 简体中文). High taste; lives in tools like VS Code, Figma, and terminal apps.
- **AI agents** (indirectly): they never see the UI, only the file and the CLI's stdout. Everything agent-facing must stay machine-readable and stable.

## Brand & Tone

- **"Reviewer-grade reading experience"** is a core principle: typography and rendering quality matter as much as features. This is a tool for *thinking about documents*.
- Visual identity: P.I.N.O.C. editorial design system. Warm paper, electric-green accent, Ancho UltraBold display caps, Outfit body, Geist Mono for the machine-flavored bits (filenames, code). Confident, editorial, quiet until something needs attention.
- Review marks use a fixed semantic language: green = insertion, warm brick red = deletion, gold = highlight, green dotted underline = comment anchor.

## Anti-references

- Google Docs' chrome-heavy review UI (we want the margin-rail *idea* without the toolbar forest).
- Generic SaaS dashboards; AI-slop gradients/glassmorphism; anything that reads "web app" more than "document".
- Electron-style over-chrome. The document is the interface.

## Strategic principles

1. The document column is sacred: nothing competes with reading.
2. Marks are the data: every review affordance hangs off CriticMarkup spans.
3. Local, fast, silent: no network, no spinners unless real work is happening.
4. Keyboard-first where it counts: Cmd+S, Cmd+E, Esc.
5. One file per session; the agent loop (--wait / hand back) is the product's spine.
