# Plan — m4-03 · Match recording and history

**Milestone:** m4-03
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** pending
**ADR:** none. The pieces that constrain the future are in ADR 0019 (the database decides idempotence) and in section 3 (the message carries everything a replay needs)

## 1. Objective

The match server tells a signed-in player from a guest by the ticket in the join options, and when the
match ends it publishes **one** `match-ended` message carrying everything a replay would need. The
platform consumes the queue and stores the match, its agents and its ordered events, exactly once per
match, and answers the battle-history query the client reads.

This is the milestone where the two backends first speak to each other. It is also the one that makes
the spec's "done when" true: a match rebuilt from what was stored has the same final-state hash as the
live one.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/game-server/src/ticket.ts` | create | `verifyTicket(token, publicKey)`; the claim shape, mirroring `platform-api`'s signer |
| `backend/game-server/src/match-ended.ts` | create | The message shape, and the function that builds one from a finished room |
| `backend/game-server/src/queue.ts` | create | The publisher port, the SQS adapter, and an in-memory adapter for tests |
| `backend/game-server/src/config.ts` | modify | `readPublicKey`, `readQueueUrl` |
| `backend/game-server/src/battle-room.ts` | modify | `onAuth` verifies the ticket; the room keeps a match id, a seed, a start time and the ordered events; `finish()` publishes once |
| `backend/game-server/src/main.ts` | modify | Builds the publisher from the environment and passes it to the room through `gameServer.define`'s default options |
| `backend/game-server/package.json` | modify | `jose`, `@aws-sdk/client-sqs` |
| `backend/game-server/src/ticket.test.ts`, `match-ended.test.ts`, `queue.test.ts` | create | Section 4 |
| `backend/game-server/src/battle-room.test.ts`, `integration.test.ts` | modify | Section 4 |
| `backend/platform-api/src/db/entities/match.entity.ts` | create | `matches` |
| `backend/platform-api/src/db/entities/match-agent.entity.ts` | create | `match_agents` |
| `backend/platform-api/src/db/entities/match-event.entity.ts` | create | `match_events` |
| `backend/platform-api/src/migrations/Migration<timestamp>.ts` | create | The third migration: the three match tables |
| `backend/platform-api/src/queue/queue.ts` | create | The consumer port, the SQS adapter, and a fake for tests |
| `backend/platform-api/src/matches/match-ended.consumer.ts` | create | Poll, hand over, delete; the DLQ path |
| `backend/platform-api/src/matches/matches.service.ts` | create | Store a match idempotently; resolve `agent_id` by class; the history query |
| `backend/platform-api/src/matches/matches.controller.ts` | create | `GET /me/matches?cursor=` |
| `backend/platform-api/src/app.module.ts` | modify | Registers the consumer and the controller |
| `backend/platform-api/package.json` | modify | `@aws-sdk/client-sqs` |
| `backend/platform-api/src/matches/*.test.ts` | create | Section 4 |
| `docker/localstack/init/01-queues.sh` | create | Creates the queue and its dead-letter queue with the redrive policy |
| `docker-compose.yml` | modify | Mounts the LocalStack init folder; `MATCH_ENDED_QUEUE_URL` on both services; `GAME_TICKET_PUBLIC_KEY` on the match server, `GAME_TICKET_PRIVATE_KEY` on the platform |
| `.env.example` | modify | The two new variables |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | The milestone marked with its PR |
| `.ia_context/inputs/backlog.md` | modify | The item section 6 opens |

## 3. Contract of the layer

**The join options and `onAuth`.** The client joins with `{ ticket?: string }`. `BattleRoom.onAuth`
verifies it with the public key and answers `{ userId } | null`; Colyseus hands that back as
`client.auth`, which is what `onJoin` and the room's own bookkeeping read.

| Join | `client.auth` | The match |
|---|---|---|
| A valid ticket | `{ userId }` | Recorded when it ends |
| No ticket | `null` | Guest: publishes nothing, stores nothing. **The flow is exactly today's** |
| An expired ticket | the join is refused | The client falls back to a guest join (m4-04) |
| A ticket signed by another key | the join is refused | The same fallback |

`PROTOCOL_VERSION` is **not** bumped. The join options are additive and optional, so a client that knows
nothing about tickets still plays a full match as a guest — which is what the spec's "signing in is
offered and never required to play" means in the protocol.

**The `match-ended` message.** Built by the room from what it already holds, and carrying everything a
replay needs:

```ts
export interface MatchEndedMessage {
  id: string;              // the match id, a uuid the room draws once, in onCreate
  userId: string;          // from the ticket
  seed: number;            // the seed the room drew
  mapId: string;
  protocolVersion: number;
  units: { unitId: string; class: string }[];  // the player's own side, in team order
  winner: 'A' | 'B';
  result: 'won' | 'lost';  // read from the player's side
  rounds: number;          // the round the match ended on
  startedAt: string;       // ISO 8601, drawn by the room
  endedAt: string;
  finalStateHash: number;  // hashState(state) at the end, the sentinel of decision D4
  events: Event[];         // the whole match, in order
}
```

`result` is computed by the room from `winner` and the human's team, so the platform never has to know
which team a signed-in player was on. The message carries `units` with their class because the platform
resolves `agent_id` by class (owner's decision D9): the match server still has no idea that an agent
exists.

**When the message is published.** In `finish()`, once, guarded by the same `ended` flag that already
stops a finished room from taking actions. A match that ends because the player left
(`onLeave` → `finish(BOT_TEAM)`) publishes exactly like one that ends on the board: the owner decided
that leaving is `lost` (D8). A guest match reaches `finish()` and publishes nothing.

**Publishing is not part of the match.** A queue that is down must not fail a join, a turn or a
reconnection. The publisher is called after the room's own state is already final, its failure is
logged with the match id, and nothing in the room waits for it. This is the one place where losing the
message is preferable to losing the match — and the reason the events are accumulated in the room from
the first accepted action, so a lost message is a lost history entry and never a corrupt one.

**The consumer.** `MatchEndedConsumer` polls the queue on `OnModuleInit`, hands each body to
`MatchesService.store()`, and deletes the message only when `store()` returns without throwing. A body
that does not parse, or that fails the shape check, is deleted and logged — it will never parse, and
retrying it forever is what the dead-letter queue exists to prevent. A body that parses but whose
`store()` throws is **not** deleted, so SQS redelivers it; after `maxReceiveCount` (5) the queue's
redrive policy moves it to the dead-letter queue, which is where a human looks.

**Idempotence.** `matches.id` is the primary key, and the insert is one transaction that writes the
match, its `match_agents` and its `match_events` together. A second delivery of the same message finds
the row and returns without writing — an `on conflict do nothing` on the match, then no work at all.
The match server also sets the message's deduplication id to the match id, which covers the window in
which SQS might deliver twice; the primary key is what makes the guarantee, and the deduplication id is
what keeps the second delivery from happening.

**The history query.** `GET /me/matches?cursor=` is newest first by `(ended_at desc, id desc)`, and the
cursor is the opaque encoding of that pair, so a page boundary cannot repeat or skip a match when two
matches share a second. It answers `{ matches: [{ id, mapId, result, rounds, endedAt }], nextCursor }`,
and `nextCursor` is null on the last page.

**What this layer does not do.** No replay endpoint and no replay screen. No rating, no matchmaking
(m5). No squad choice: the mapping is by class, which works because the squad and the map's side A are
the same three classes in the same order. No deletion or retention policy for old matches.

## 4. Tests planned

**Match server — the ticket (`ticket.test.ts`)**
- [ ] A ticket a matching private key signed verifies and answers the user id.
- [ ] A ticket whose payload was changed after signing is refused.
- [ ] A ticket signed by another key is refused.
- [ ] An expired ticket is refused; one that is one second from expiry verifies.
- [ ] A malformed string, an empty string and a token with two segments are refused rather than thrown.

**Match server — the room (`battle-room.test.ts`, `integration.test.ts`)**
- [ ] A join with a valid ticket authenticates, and the finished match publishes one message whose
      `userId` is the ticket's.
- [ ] A join with **no** ticket is a guest, plays exactly as today, and publishes nothing.
- [ ] A join with an expired ticket is refused, and the same client then joins as a guest.
- [ ] A guest and a signed-in player can play the same room type on the same server without either
      seeing the other's outcome.
- [ ] A match that ends because the player left publishes one message with `result: 'lost'`.
- [ ] A match that ends on the board publishes one message with the winner's `result`.
- [ ] `events` is the whole match in order: its length is the number of events the client received,
      concatenated, and replaying it reaches the final state.
- [ ] **Determinism from the message:** `hashState(applyEvents(createMatchSetup(message.seed), message.events))`
      equals `message.finalStateHash` — the live match's own hash. This is the spec's case, and it
      lives here because the setup a replay needs is the match server's data.
- [ ] The publisher throwing does not fail the match: the room still ends, the client still gets
      `ended`, and the failure is logged.

**Match server — the publisher (`queue.test.ts`)**
- [ ] The SQS adapter sends one message with the match id as `MessageDeduplicationId` and its body
      exactly the serialized message.
- [ ] A missing `MATCH_ENDED_QUEUE_URL` stops the server at boot.

**Platform — storing (`matches.service.test.ts`, against the PostgreSQL of CI)**
- [ ] A message stores one match, its `match_agents` and its `match_events` in order.
- [ ] The same message delivered twice stores one match: the second call writes nothing, and the
      agents and events are not duplicated.
- [ ] Events keep their `seq`, and the primary key `(match_id, seq)` is what the insert relies on.
- [ ] `agent_id` is resolved by class: `A-sniper` becomes the sniper of the player's squad, and a unit
      whose class the squad does not have is skipped rather than crashing the store.
- [ ] A message whose `userId` is unknown is a failure, not a silent skip: it goes back to the queue.
- [ ] A message that does not parse is discarded and logged, and does not throw out of the consumer.
- [ ] The stored events round-trip: what the database gives back is byte-for-byte the message's events.
      With the match server's determinism case above, this is the spec's "rebuilt from the database"
      property, established in two steps rather than one.

**Platform — the consumer (`match-ended.consumer.test.ts`, against a fake queue)**
- [ ] A delivered message is stored and deleted.
- [ ] A message that fails to store is not deleted, so it is redelivered.
- [ ] After the configured number of failed receives the message is not retried by the consumer again
      (the queue's redrive policy owns what happens next).
- [ ] The consumer stops on module shutdown, and stops polling then.

**Platform — the history query (`matches.controller.test.ts`)**
- [ ] It is newest first and pages by cursor: a first page, a second, and a null cursor at the end.
- [ ] Two matches with the same `ended_at` are neither repeated nor skipped across a page boundary.
- [ ] It never returns another user's matches, with two users and matches on both sides.
- [ ] Without a session it is `401`.

## 5. Dependencies

- **m4-01 approved** (the migration runner and the entities) and **m4-02 approved** (the ticket the room
  verifies, and the users the matches point at). The dependency on m4-02 is real: without a ticket there
  is no way to know whose match it is.
- **LocalStack** on the local flow (`npm run infra:up`), with the queue created by
  `docker/localstack/init/01-queues.sh`. The tests do **not** need it: they run against the in-memory
  adapters, which is why CI gets a PostgreSQL service and not a LocalStack one.
- **A key pair** shared by the two services, the one m4-02 generates. The match server reads only the
  public half.

## 6. Out of scope

- The replay endpoint and the replay screen. The events are stored so that they can arrive; reading
  them back is the spec's next M4 delivery.
- **A test that rebuilds a match from the database with the engine in the same process.** It cannot be
  written today: `createMatchSetup` — the board, the classes and the ability catalog a replay needs —
  lives in `backend/game-server`, and `platform-api` importing it would make the platform depend on the
  match server. The two halves are tested (the server proves the message is sufficient, the platform
  proves the database holds the message unchanged), and the whole is opened as a backlog item for the
  replay delivery, whose plan has to solve the shared-content question anyway. Recorded here rather
  than left implicit, because it is the difference between the spec's sentence and what this delivery
  proves.
- Rating, matchmaking, PvP (m5), and the asynchronous rating update the roadmap puts in m5.
- Retention, anonymisation and deletion of old matches. The privacy policy's retention promise is met by
  the account-deletion flow, which is out of scope for the whole delivery.
- Squad choice, which would make the class-based mapping wrong and is what the next M4 delivery brings.
- Reconnection changes. The room's reconnection behaviour is untouched: a resumed match keeps playing
  and publishes once at the end.

## 7. Decisions

**D1 · The room accumulates events, and the publisher is fire-and-forget.** The alternative — sending
each event to the queue as it happens — puts the queue on the path of every turn, and makes a queue
outage a gameplay problem. One message at the end costs the history of a match whose server dies
mid-match, which is a match nobody finished anyway.

**D2 · The consumer establishes its own idempotence in the database, not in the queue.** FIFO
deduplication has a five-minute window; the primary key has none. The queue's deduplication id is set
because it is free, and the guarantee is the insert.

**D3 · A malformed body is discarded; a well-formed one that fails is retried.** The two failures are
different: the first will never succeed, and retrying it is a poison pill. The second is a database
that was briefly away, and the dead-letter queue is a better place for it than a log line nobody reads.

**D4 · `final_state_hash` is recorded by the match server.** Owner's decision D4 of the index. The
setup is still rebuilt from the code, so a change to the classes, the maps or the ability catalog can
change what an old match replays to — and with the hash stored, that change shows up as a mismatch
instead of passing unnoticed. The hash is `hashState` of the final `MatchState`, the engine's own
function, so the sentinel costs one column and no new code.

**D5 · `GET /me/matches` belongs to this milestone, not to the client's.** The tables are here, the
query is here, and the client milestone then has no backend work at all — which is what lets m4-04 be
reordered against m4-05 without touching either.

**D6 · The message carries the player's units with their classes.** The alternative — carrying the
`agent_id`s — would mean the platform signing a ticket that knows the squad, and the ticket outliving a
squad change. Classes are the one thing both sides already agree on.
