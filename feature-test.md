# Feature Test — Mastermind

A scratch document for exercising the recent work: the **callout band** treatment,
**cross-block selection**, and the **top-right toast**. Select freely, comment,
highlight, and hand back.

## How to test

1. **Callouts** — scroll to the four meta-sections below; each should render as an
   inverted ink band with its own icon (`?`, check, checklist, triangle).
2. **Cross-block selection** — drag a highlight from this paragraph down into the
   next one. The toolbar should appear and a mark should land in *each* block.
3. **Toast** — accept or reject a mark, or hand back; the toast appears top-right.

> "The file on disk is the single source of truth." Everything round-trips through
> this `.md` — marks flow one direction, user to agent.

This is a second standalone paragraph immediately after the blockquote, on purpose:
it gives you two adjacent blocks{== of prose to rubber-band a selection across so you
can watch a single drag become two independent highlights.==}

{==And a third paragraph, so a long==} top-to-bottom drag spans *three* blocks at once —
heading-to-paragraph, paragraph-to-list, and list-to-table are all worth trying.

## Decisions

- Kafka topic retention stays at **7 days**.
- Ship behind a flag; default off for tenants over 10k seats.
- {==Postgres remains the system of record==} through the whole migration.

## Open questions

- [ ] Do we need exactly-once delivery, or is at-least-once fine?
- [ ] Who owns the Redis cache eviction policy?
- [ ] Is 7 days of retention enough for the replay tooling? {>>@kd: check with data eng<<}

## To-do

- [ ] Wire the eviction metric into the dashboard
- [ ] Backfill the 0.3 release notes
- [ ] Add a contract test for the replay path
- [x] Stand up the staging Kafka cluster

## Risks

- Replay storms if the consumer lags past the retention window.
- Cache stampede on cold start under a thundering-herd login.
- {--Tight coupling to the legacy cron scheduler--} is being removed this sprint.

## Architecture

| Component      | Today        | After Phoenix    |
| -------------- | ------------ | ---------------- |
| Ingestion      | Nightly cron | Kafka consumer   |
| Storage        | Postgres     | Postgres + Redis |
| Report trigger | Scheduled    | Event-driven     |

Here's the consumer loop, for reference:

```ts
for await (const event of stream) {
  const report = await build(event)
  await publish(report)
}
```

### Notes

A short trailing section so the document doesn't end on a fenced block — nested
headings (`###`) are *not* callouts, only the matched meta-section titles above are.
