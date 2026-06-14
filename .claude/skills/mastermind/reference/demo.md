# Welcome to Mastermind

This is a demo document. Mastermind renders Markdown **and** CriticMarkup review marks,
and the language toggle (top bar) flips it between your two reading languages.

## What you're looking at

The file on disk is the single source of truth — no database, no cloud. An agent writes
a plan here; you review it {++with inline edits++} and comments; it reads the same file back.

> Marks flow one direction only: the agent proposes, you accept. Nothing reaches disk
> until you approve it.

## The five review marks

- Insertion — adds {++a few words++} to the text.
- Deletion — removes {--an outdated phrase--}.
- Substitution — swaps {~~old wording~>clearer wording~~}.
- Highlight — calls out {==a passage worth a second look==}.
- Comment — leaves a margin note. {>> Try clicking the language toggle above. <<}

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
