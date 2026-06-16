# Welcome to Mastermind

This is a demo document. Mastermind renders Markdown **and** your review marks,
and the language toggle (top bar) flips it between your two reading languages.

## What you're looking at

The file on disk is the single source of truth — no database, no cloud. An agent
writes a plan here; you mark it up; it reads the same file back.

> Marks flow one direction only: you annotate, the agent re-reads. Nothing is sent
> anywhere — your notes live in the file as CriticMarkup.

## How to review

- **Comment on a passage** — select some text (or hover a paragraph and use the
  button on its right) and choose *Comment*. The passage is highlighted and your
  note rides along. {==This sentence carries a comment.==}{>>@you: like this one — a margin note for the agent.<<}
- **Suggest a deletion** — select text or a whole block and choose *Suggest
  deletion*. It stays visible but {--struck through--}, so you can see what's queued
  for the agent. Changed your mind? Click the struck-through text to undo it.

## A small table and some code

| Surface | Purpose      |
| ------- | ------------ |
| Reading | review marks |
| Source  | raw markdown |

```ts
function greet(name: string): string {
  return `Hello, ${name}`
}
```

Toggle the language to see this same document in your secondary language.
