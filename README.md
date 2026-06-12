# Mastermind

A local-first markdown viewer/editor for reviewing and discussing documents with AI coding agents.

The core loop: an agent writes a plan as a `.md` file → you open it in Mastermind → read, edit, highlight, and comment using [CriticMarkup](http://criticmarkup.com/) → save → the agent re-reads the same file and continues. **The file on disk is the single source of truth and the only communication channel.**

> 🚧 v0.1 under construction. See `docs/spec/` for the full product spec.

## Install (local clone only — not published to npm)

```sh
npm install
npm run build
npm link
mastermind open README.md
```
