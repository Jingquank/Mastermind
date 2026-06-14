# Project Phoenix — Migration Plan

A dummy document for trying out **Mastermind**'s reading, editing, and review views.

## Overview

Project Phoenix moves our legacy reporting pipeline off the nightly cron jobs and
onto an event-driven architecture. The goal is *fresher data*, fewer 3am pages,
and a codebase the next engineer can actually read.

> "The file on disk is the single source of truth." — the whole point of this tool.

## Goals

1. Replace the nightly batch with a streaming consumer.
2. Cut report latency from ~6 hours down to under 5 minutes.
3. Delete the three cron jobs nobody remembers writing.

## Non-goals

- Rewriting the dashboard frontend (separate effort).
- Migrating historical data older than 2 years.

## Architecture

| Component      | Today          | After Phoenix      |
| -------------- | -------------- | ------------------ |
| Ingestion      | Nightly cron   | Kafka consumer     |
| Storage        | Postgres       | Postgres + Redis   |
| Report trigger | Scheduled      | Event-driven       |

Here's a tiny taste of the consumer loop:

```ts
for await (const event of stream) {
  const report = await build(event);
  await publish(report);
}
```

## Open questions

- [ ] Do we need exactly-once delivery, or is at-least-once fine?
- [ ] Who owns the Redis cache eviction policy?
- [ ] Confirmed: Kafka topic retention stays at 7 days.

## Timeline
The rollout happens in three phases over **six weeks**, with a feature flag
gating each step so we can roll back fast. See [the spec](https://example.com)
for the gory details.

---

*Draft — review and leave comments in Mastermind.*
