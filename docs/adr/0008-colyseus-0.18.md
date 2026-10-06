# 0008. Colyseus 0.18 for the match server

**Status:** Accepted

## Context

DT-08 tracks the advisories `npm audit` reports on the server path. The blocking one is `nanoid` (<= 3.3.17), a high advisory pulled in by `@colyseus/core` 0.16, and it has no fix inside the 0.16 line: the fix ships with Colyseus 0.18. Most of the moderate and low advisories on the same path also close only with 0.18, or with `overrides` on packages that 0.16 pins. The M2 gate says the public deploy does not ship until the migration is done and the audit shows no high advisory on the server path, so the migration has to happen before M2-a is written — retrofitting it under a room already built on the 0.16 API would cost more.

## Decision

**Migrate to Colyseus 0.18 before the M2-a code is written.** The versions in use when this ADR was accepted:

| Package | Version |
|---|---|
| `colyseus` | 0.18.9 |
| `@colyseus/core` | 0.18.18 |
| `@colyseus/ws-transport` | 0.18.4 |
| `@colyseus/schema` | 5.0.35 |
| `@colyseus/sdk` | 0.18.4 (dev, used by the tests) |
| `@colyseus/testing` | 0.18.6 (dev) |

**`client.id` is gone.** A client is identified by `client.sessionId`. The room stores that string, not a `Client` and not an id of its own: the session *is* the identity, so a reconnecting client is recognised without a lookup table.

**`setMetadata` replaces the metadata object.** A room no longer assigns `this.metadata = {...}`; it calls `this.setMetadata({...})`, which replaces the whole metadata object, as assignment does, and also tells the matchmaker about the change. Assigning the field would desync the room from the matchmaker.

**Reconnection goes through `allowReconnection`.** `onDrop` calls `this.allowReconnection(client, seconds)`, which returns a `Deferred<Client>` that resolves on reconnect and rejects when the window expires. `onLeave` therefore runs *after* the window, not at the drop, which is what makes "the human forfeits when the window expires" a rule the room can express in one place. `onReconnect` is where the client is sent the state it missed.

**State sync stays out of Schema.** The room keeps the engine's `MatchState` in a private field and sends `publicState` as a JSON message. Colyseus Schema is a change-tracking layer for mutable server state; the engine's state is immutable and already has a public projection and a replay path, so a second serialization format would only be a second source of truth.

## Consequences

- The DT-08 gate is met: `npm audit` reports 19 advisories (14 low, 5 moderate, **0 high, 0 critical**) and none of the high ones is on the server path. The remaining low advisories on the Colyseus packages are not fixed in 0.18.9; they stay tracked in DT-08.
- The room, the bot and the protocol are written against the 0.18 API from the start, so no compatibility shim is needed and none is left behind.
- The client must speak 0.18 too: `@colyseus/sdk` 0.18 is what the browser build depends on for matchmaking and reconnection.
- `@colyseus/testing` 0.18 boots a real server and binds a real port, so each test file needs a port of its own and the tests run the room over a websocket instead of calling it directly.
- A future Colyseus release means a new ADR that supersedes this one, not an edit to this one.
