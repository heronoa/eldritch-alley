# 0010. Movement by destination, and commands name their turn

**Status:** Accepted (2026-10-05)

## Context

Movement is one step per action (DT-54). The client decides which cells are reachable from adjacency alone, so its preview offers cells the engine refuses: a one-level climb costs two movement points, and the preview ignores that cost (playtest 1, EA-2). Multi-cell movement with a path preview (EA-7) needs the engine to know the path. Automatic end of turn (EA-4) sends `endTurn` after a countdown, and a late or repeated message could end the next unit's turn.

## Decision

1. **A move names only its destination.** The engine finds the cheapest path to it within the unit's remaining movement and returns the path in the `moved` event. Ties are broken by a fixed neighbour order (x, then y), so the same state always gives the same path (ADR 0005).
2. **Each unit has a movement profile:** `maxStepUp` (1), `maxStepDown` (1) and `climbCost` (1). A step is allowed when the level difference is between `-maxStepDown` and `maxStepUp`. Its cost is `1 + climbCost × max(0, climb)`. The defaults are the rule in force before this decision, so the current behaviour does not change. Abilities change the profile or add their own actions later; none is implemented here.
3. **Allies are passable and are not destinations.** Enemies block the path. An occupied destination is refused.
4. **Reachability is computed by the engine.** `reachableCells` and `findPath` are pure functions. The client imports them, so the preview and the server use one function. The engine keeps no Node or framework dependency, and a test enforces it.
5. **`endTurn` names the round it applies to.** The engine refuses it with `stale-turn` when the round differs from the current one. The unit check (`not-your-turn`) stays.
6. **Protocol version is bumped.** `moved` gains `path`, and `endTurn` gains `round`.

## Consequences

- DT-54 is closed.
- The one-step move is removed. Clients built on the old protocol cannot play; the protocol bump covers this.
- No persisted replays exist before M4, so no event migration is needed. The replay format must include `path` when it is created in M4.
- The rules unchanged: integer math (ADR 0005), initiative (ADR 0001), permanent death (ADR 0003).
- Nothing in this ADR changes the resource rules of ADR 0002.
