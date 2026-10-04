# Plan — Quick wins, M1: backend (test suites that run, and the server's message check)

**Milestone:** m1-backend
**Parent feature:** [debt-quick-wins.index.md](./debt-quick-wins.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Three debts, all in `backend/`, each small:

- **DT-32:** the game-server suite does not start, so none of its `battle-room` tests run.
- **DT-31:** one engine property test sits on the 5 s default timeout and fails on a loaded machine.
- **DT-20:** the server hands a client payload to the engine without checking its shape. A `move` without
  `to` throws inside the room handler.

Done together, the root `npm test` runs every backend suite, and a bad payload is refused instead of thrown.

### 2. Prerequisites

- None.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `backend/game-server/vitest.config.ts` | rename to `vitest.config.mts` | Vite loads an `.mts` config as ESM. Content unchanged (keeps the `pool: 'threads'` comment). The file is the only change for DT-32 |
| `backend/game-server/src/battle-room.ts` | modify | `handleAction` checks the shape of the payload before `resolveHumanAction` (section 4.2) |
| `backend/game-server/src/protocol.ts` | modify | The refusal type the server sends widens to `RejectReason \| 'malformed-action'` (section 4.2). The engine's `RejectReason` is not touched |
| `backend/game-server/src/action-shape.ts` | create | Pure check of a `ClientAction`: returns `true` only for the four shapes the protocol defines (section 4.2) |
| `backend/game-server/src/action-shape.test.ts` | create | Every shape, valid and invalid |
| `backend/game-server/src/battle-room.test.ts` | modify | One test: a malformed action is refused, the room does not throw, the state is unchanged |
| `backend/engine/src/properties.test.ts` | modify | The property test gets an explicit timeout of 30 000 ms (section 4.3) |
| `frontend/src/protocol.ts`, `frontend/src/game/log.ts`, `frontend/src/game/log.test.ts` | modify | The new refusal reason on the client copy, and its Portuguese sentence in `describeRejection` (section 4.2). Nothing else in the frontend |

Not touched: the engine's rules, the server's `protocol.ts` shape of any existing message, the rest of the frontend.

### 4. Contracts

#### 4.1 DT-32 — the config

- Cause (recorded in the debt): `vitest.config.ts` is loaded as CJS, and `import { defineConfig } from 'vitest/config'` resolves to an ESM-only entry, which fails with `ERR_REQUIRE_ESM`.
- Fix: rename to `.mts`. Do not add `"type": "module"` to the package, because the compiled `dist` of the server relies on the current module format.
- Verify before changing anything else: `npm test -w @eldritch-alley/game-server` runs and reports the `battle-room` tests.

#### 4.2 DT-20 — the shape check

```ts
// action-shape.ts
export function isClientAction(value: unknown): value is ClientAction;
```

- `{ type: 'move', to: { x: integer, y: integer } }`
- `{ type: 'attack', target: string }`
- `{ type: 'reload' }`
- `{ type: 'endTurn' }`

Any other value, any extra or missing field of the wrong type, `NaN`, non-integer coordinates → `false`.

In `handleAction`, after the turn check and before `resolveHumanAction`:

```ts
if (!isClientAction(action)) {
  this.refuse(client, 'malformed-action');
  return;
}
```

- `'malformed-action'` is a server-side refusal, not an engine rule. Widen only the type of refusals the
  server sends (`backend/game-server/src/protocol.ts`), as `RejectReason | 'malformed-action'`, and mirror
  it in `frontend/src/protocol.ts`. The engine's `RejectReason` in `backend/engine/src/types.ts` is not changed. This is the one protocol-visible change: `PROTOCOL_VERSION` stays at 2 because the
  message shape does not change, only one more string value can arrive.
- The client's `describeRejection` must map it to a Portuguese sentence, for example "Ação inválida." If
  it is not mapped, the log shows the raw code, which breaks the rule in `log.ts`.

#### 4.3 DT-31 — the timeout

- Only the one test that replays 200 seeds × 40 steps gets `{ timeout: 30_000 }`. Other tests keep the default,
  so a real slowdown elsewhere still shows.
- Do not change the number of seeds: the test's value is its coverage.

### 5. Tests planned

**`action-shape.test.ts`**
- [ ] A valid `move`, `attack`, `reload` and `endTurn` each return `true`.
- [ ] `move` without `to` → `false`. `move` with `to: {x: 1.5, y: 0}` → `false`. `move` with `to: null` → `false`.
- [ ] `attack` without `target`, or with a numeric `target` → `false`.
- [ ] `null`, `undefined`, a string, `{}` and `{ type: 'teleport' }` → `false`.
- [ ] An extra field on a valid action does not make it invalid (`{ type: 'reload', extra: 1 }` → `true`).

**`battle-room.test.ts`** (the suite that DT-32 unblocks)
- [ ] A malformed action from the human is refused with `malformed-action`; the match state and the event count do not change; the room is still running (a valid action afterwards is accepted).

**Automated, root:**
- [ ] `npm test` at the repository root runs all four workspaces, with no `Startup Error` and no skipped file.
- [ ] The engine property test passes on a loaded machine (run it with another test suite in parallel).

### 6. Dependencies

- None.
- The client mapping of 4.2 is part of this milestone (see the files table), so the new refusal reads as a sentence from the moment it ships.

### 7. Execution steps

1. Confirm the DT-32 failure: `npm test -w @eldritch-alley/game-server`. Record the error.
2. Rename the config to `.mts`. Re-run step 1: the suite must start.
3. Write `action-shape.test.ts`, see it fail, then write `action-shape.ts`.
4. Add the `battle-room` test, then the check in `handleAction`.
5. Widen the server's refusal type in `backend/game-server/src/protocol.ts`, mirror it in `frontend/src/protocol.ts`, and map it in `describeRejection` (test in `log.test.ts`).
6. Add the explicit timeout in `properties.test.ts`.
7. Run `npm test` at the root, and `npm run typecheck`.

### 8. Acceptance

- [ ] Root `npm test` runs all four workspaces with no startup error.
- [ ] Every test of 5 passes.
- [ ] `backend/engine/src/` rules unchanged (`git diff -- backend/engine/src/actions.ts backend/engine/src/events.ts` is empty).
- [ ] `technical-debt.md`: DT-32, DT-31 and DT-20 moved to the Closed table with their resolution.

### 9. Out of scope

- Rules, balance, reactions (DT-17), or the bot (DT-21, a separate item).
- Any change to the frontend beyond the one `describeRejection` mapping.
