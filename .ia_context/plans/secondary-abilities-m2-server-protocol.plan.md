# Plan — m2 · Server: the second ability per class, the bot and protocol 11

**Milestone:** m2-server-protocol
**Parent feature:** secondary-abilities
**Created:** 2026-10-17
**Status:** pending
**Depends on:** m1-engine approved

## 1. Objective

The match server authors the three new ability definitions, gives each class a second active slot,
teaches the bot to consider the new plays, and carries the new action, state and events over
**protocol 11** in both mirrors. The server remains the only authority: it validates what the client
sends through `action-shape`, hands the action to the engine and publishes whatever the engine says.

The layer's contract is the codec and the room's re-broadcast shape. It does not change the rules —
m1 owns them — and it does not draw anything.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/game-server/src/abilities.ts` | modify | Three definitions: `camouflage`, `mud`, `resurrection`; `CLASS_ABILITIES` becomes two slots per class |
| `backend/game-server/src/map.ts` | modify | `abilitiesFor` fills `activeSets: [primary, secondary]` |
| `backend/game-server/src/bot.ts` | modify | Candidate generation and scoring per effect kind; revive cell search; camouflaged enemies are not chased |
| `backend/game-server/src/protocol.ts` | modify | `PROTOCOL_VERSION = 11`; `ClientAction.useAbility` gains `target?`; state and event mirrors carry m1's fields |
| `backend/game-server/src/action-shape.ts` | modify | `useAbility` accepts an optional integer/id `target`; wrong shapes are refused |
| `backend/game-server/src/abilities.test.ts` | modify | The three definitions and the two-slot map |
| `backend/game-server/src/map.test.ts` | modify | Every class carries two slots and the first stays the old ability |
| `backend/game-server/src/bot.test.ts` | modify | Per-kind candidates, scores and the no-zero-score trap |
| `backend/game-server/src/action-shape.test.ts` | modify | `target` accepted, malformed `target` refused |
| `backend/game-server/src/battle-room.test.ts` | modify | Version 11 assertion; a `useAbility` with `target` reaches the engine; state carries the new fields |
| `backend/game-server/src/integration.test.ts` | modify | A whole bot match that casts the three abilities and replays to the same hash |
| `frontend/src/protocol.ts` | modify | Mirror of the server codec: version 11, `target?`, the new state/event/reason members |

No change to `battle-room.ts` beyond what the shared types force; no change to `match-ended.ts`,
`queue.ts` or `ticket.ts`.

## 3. Contract of the layer

### 3.1 The catalog

```ts
camouflage: {
  id: 'camouflage', cost: 3, range: 0, needsSight: false,
  effect: { kind: 'camouflage', radius: 0, turns: 3, breakChance: 30 },
},
mud: {
  id: 'mud', cost: 1, range: 3, needsSight: true,
  effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
},
resurrection: {
  id: 'resurrection', cost: 3, range: 3, needsSight: false,
  effect: { kind: 'revive', radius: 0 },
},
```

`CLASS_ABILITIES` stops being `Record<Class, string>` and becomes a two-entry tuple per class:

```ts
const CLASS_ABILITIES: Record<string, readonly [string | null, string | null]> = {
  sniper: ['piercing-shot', 'camouflage'],
  wizard: ['fireball', 'mud'],
  priest: ['area-heal', 'resurrection'],
};
```

`abilitiesFor` spreads it into `activeSets: [primary, secondary]`. The first slot is unchanged, so
an old action that named `piercing-shot`, `fireball` or `area-heal` keeps working.

### 3.2 Protocol 11

`PROTOCOL_VERSION` becomes 11 in `backend/game-server/src/protocol.ts` and in
`frontend/src/protocol.ts`, in the same commit: the two files are mirrors, and a half-bump breaks
every client. What changed:

- `ClientAction.useAbility` gains `target?: UnitId` — sent only for `resurrection`.
- `PublicState` gains `units[].camouflage`, `units[].prone` and the top-level `difficultTerrain`.
- Events gain `camouflage-ended`, `stood-up`, `terrain-expired`, `revived`; `moved` gains
  `rngState` and `prone`; `ability-used` gains `target?`.
- `RejectReason` gains `target-hidden`.

The room keeps its existing behaviour: a message with another version is refused and the state is
re-broadcast from the engine after every accepted action. No server-side rule is re-implemented; the
room copies the engine's public state, as it does today.

### 3.3 Action shape

`useAbility` still requires an integer `to.x`/`to.y`. When `target` is present it must be a string;
when absent it stays absent. A `target` of another type is a malformed message and is refused like
any other bad shape — the engine never sees it. The shape layer does not know which abilities take a
target; that is the engine's `target-invalid` answer.

### 3.4 The bot

The bot asks the catalog what each carried ability does and builds candidates per kind. The rule it
must not break: **a candidate that cannot score is not offered**. Today `endTurnWhileEngaged` is
`-1`, and a zero-score candidate would silently beat it.

| Kind | Candidate | Score |
|---|---|---|
| `damage` | an enemy cell in range and sight | the existing damage score |
| `heal` | an ally cell in range and sight | the existing heal score; the current gap — heal was scored from enemy cells — is fixed |
| `terrain` | a cast whose 3×3 covers enemies more than allies | `2 * enemies - allies`, added only when positive |
| `camouflage` | self-cast when a wounded sniper is near an enemy and the ability is affordable | a positive constant, lower while the sniper is safe |
| `revive` | the first free cell in range around a fallen ally's body | a high constant; added only when a body exists |

`nearestEnemyDistance` (the chase/closer-move heuristic) skips camouflaged enemies: walking toward
someone the sniper cannot shoot is wasted movement. Areas and abilities still target their cells.

The weights are named constants (index I9) and are expected to move in playtest.

### 3.5 What this layer does not do

- It does not validate the rules again, re-roll, patch the state or invent events.
- It does not render, translate or choose a menu row.
- It does not add a database column, a migration or a replay format.

## 4. Planned tests

**`abilities.test.ts`**

- [ ] The catalog holds the three definitions with exactly the cost, range, sight and effect fields
      above.
- [ ] Every class maps to two slots, and the first slot is the ability from before this delivery.

**`map.test.ts`**

- [ ] A setup for each class carries both ids in `activeSets`, and `validateCatalog` accepts it.

**`action-shape.test.ts`**

- [ ] `useAbility { abilityId, to }` is accepted.
- [ ] `useAbility { abilityId, to, target }` with a string `target` is accepted.
- [ ] A numeric, null or object `target` is refused as a malformed message.

**`bot.test.ts`**

- [ ] With a fallen ally and mana, the Priest's turn includes a revive candidate on a free cell, and
      it is chosen over `endTurn`.
- [ ] With no fallen ally, no revive candidate exists.
- [ ] A terrain cast that covers more enemies than allies is offered; one that covers only allies is
      not.
- [ ] A camouflaged sniper near a wounded enemy picks camouflage; a safe one does not.
- [ ] No new kind produces a zero-score candidate while engaged.
- [ ] A camouflaged enemy is not chased, but an area cast can still include its cell.
- [ ] A heal is aimed at an ally cell.

**`battle-room.test.ts`**

- [ ] The room announces version 11 and refuses version 10.
- [ ] A `useAbility` carrying `target` is applied and the broadcast state shows the revived unit on
      its new cell.
- [ ] After camouflage and a mud cast, the broadcast state carries `camouflage`, `prone` and
      `difficultTerrain`, and the events carry the new members.

**`integration.test.ts`**

- [ ] A seeded bot match in which the three abilities are cast replays from its events to the same
      final hash, and the server's final hash matches the engine's.

## 5. Dependencies

- **m1 approved.** The types, events and refusals must be frozen; this milestone only authors data
  and transport.
- The protocol bump must change both mirrors in the same change. If the frontend review needs to
  move first, the two files still travel together.

## 6. Out of scope

- Engine rules (m1).
- Client menu, aim, log, i18n and visuals (m3, m4).
- Matchmaking, persistence or the platform API: nothing here reaches the database.
- Tuning the bot beyond "it uses the abilities and never picks a zero-score candidate"; the weights
  are provisional.
- Backward compatibility with protocol 10: the room already refuses other versions.
