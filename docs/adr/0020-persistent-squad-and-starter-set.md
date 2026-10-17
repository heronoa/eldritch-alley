# 0020. A persistent squad with a starter set

**Status:** Accepted (2026-10-16). Addendum to [0003](0003-permanent-death.md).

## Context

ADR 0003 makes death permanent *within a match*: a soldier that dies does not come back for the rest of
that battle. That was a decision about the tactical layer, taken when a match was the only thing that
existed. M4 gives a player an account that outlives a match, which turns the same question into two:
what does a player own between matches, and what happens to a unit that died in the last one?

A player also needs something to fight with the first time they sign in. Without it, the profile panel
in m4-04 has nothing to draw, the match server has no unit ids to record, and a new player would have to
be given a squad by a hand-run script.

## Decision

1. **The squad is rows in `agents`**, one per unit, owned by the account (`user_id`), carrying the class
   (`sniper`, `wizard` or `priest`), the level and the status. It survives a browser, a device and a
   sign-out, because it is not the client's.
2. **The starter set is one of each class, level 1, `active`**, and it is created **on the insert path of
   a new account, inside the same transaction that creates the account**. A callback that fails half way
   leaves neither, so a retry either finds the identity and takes the sign-in path, creating nothing, or
   creates the account and its squad together.
3. **There is no "does this player have a squad?" check on sign-in.** A check that runs on every sign-in
   is a check that will one day run against a player whose squad was legitimately changed — sold, merged,
   wiped by a campaign rule — and hand them a new one. The account's creation is the only moment the
   squad is written.
4. **The platform owns the roster; the engine owns the numbers.** What a level or a class *means*
   in combat stays in `backend/engine`, where the abilities and their costs already are (ADR 0016); the
   platform stores which units a player has and what they are called.
5. **`status` has three values — `active`, `dead`, `retired` — and this delivery writes only `active`.**
   A `dead` agent means dead between matches; a `retired` one was put away by the player.
6. **Death between matches and level-up are both deferred**, and neither is implied by this ADR. Today a
   squad is created once and never changes. What happens to a unit that ends a match dead, whether a
   level is earned or granted, and what a level does to a unit, are decisions for the campaign milestone
   and will be ADRs of their own.

## Consequences

- A player's squad is durable from the first sign-in, which is what lets m4-03 store a match with the
  units that fought in it (`match_agents`) and lets m4-04 draw a profile panel without inventing units.
- The starter set is not configurable: one of each class is a constant in
  `backend/platform-api/src/auth/auth.service.ts`, and every account, present and future, has it. A
  player who wants a different squad has no way to say so yet.
- Nothing in the platform can remove an agent, and nothing can change a level. Both arrive with the
  campaign, and both will need the same thing this ADR was written to avoid: a rule about what happens
  to a squad that already exists.
- The status column is written by the schema as `active` by default, so a row inserted without one — by
  a future job, by a migration backfill — is still a unit that can fight.
