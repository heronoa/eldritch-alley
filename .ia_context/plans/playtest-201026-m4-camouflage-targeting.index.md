# Index — Camouflage blocks single-target abilities too

**Created:** 2026-10-20
**Feature pai:** [playtest-201026.index.md](./playtest-201026.index.md), item 4
**Branch:** `feat/camouflage-ability-targeting` (suggestion)
**Status:** pending — waiting for the owner's approval of this index and of m1 (including its ADR)

## What this delivery covers

Today only a basic attack is refused against a camouflaged unit (`validateAttack`,
`backend/engine/src/actions.ts:219`); `validateUseAbility` (same file, line 248) never checks a target's
camouflage, so a single-target damaging ability (`radius: 0`, e.g. `piercing-shot`) can still name the
hidden unit's cell directly. This is not an oversight — ADR 0023's decision 2A explicitly chose it:
*"Only basic attacks are refused against a camouflaged unit. Damaging abilities still reach the cell and
hit it."* The playtest wants that narrowed: a **direct** damaging ability (radius 0) is refused the same
way a basic attack is; a **splash** (radius > 0, e.g. `fireball`) still reaches the hidden unit exactly as
it does today. This delivery amends ADR 0023 §6/decision 2A rather than silently overriding it.

## Milestones

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [playtest-201026-m4-camouflage-targeting-m1-engine.plan.md](./playtest-201026-m4-camouflage-targeting-m1-engine.plan.md) | [ ] pending | — |
| 2 | [playtest-201026-m4-camouflage-targeting-m2-client.plan.md](./playtest-201026-m4-camouflage-targeting-m2-client.plan.md) | [ ] pending | — |

Only two milestones, not the usual four: this fix touches no new state, no new event and no new catalog
data, so there is nothing for a server-protocol milestone to carry — no protocol bump (reuses the
existing `target-hidden` `RejectReason`, already in both mirrors since ADR 0023). m1 is the engine rule;
m2 is the frontend's aim highlight, kept in lockstep so the client never offers a cell the server would
now refuse.

## Implementation choices to review before m1

| # | Choice | Effect and alternative |
|---|---|---|
| I1 | **The check is scoped to `effect.kind === 'damage' && effect.radius === 0`**, not to every `radius: 0` ability. A beneficial `radius: 0` ability (e.g. the Priest's new `bless`, from the sibling `piercing-and-bless` delivery) must still be castable on a camouflaged ally — camouflage hides a unit from being attacked, not from being helped. Scoping the check to `damage` effects only is what keeps that true; scoping it to every `radius: 0` ability would silently break Bless-on-a-hidden-ally once that ability exists |
| I2 | **No team check is added** — the existing `damage` resolution already "reads the caster and its own allies like anybody else" (ADR 0016 §12); this fix only adds a camouflage check, not a new restriction on whose cell may be aimed at |
| I3 | **ADR 0025** is the next free number once ADR 0024 (the sibling `piercing-and-bless` delivery) claims it; if that delivery ships after this one, the numbers swap — whichever ships first takes 0024. This plan assumes `piercing-and-bless` ships first, per the parent index's milestone order (3 before 4) |

## Scope

- `validateUseAbility` refuses a `radius: 0` damaging ability aimed at a camouflaged unit's cell, with
  the existing `target-hidden` reason.
- `abilityReach` (frontend) stops offering that cell as a legal aim for the same class of ability, so
  the tile becomes unclickable rather than clickable-then-refused.
- ADR 0025, amending ADR 0023 §6/decision 2A.

## Out of scope

- **The bot.** It may still attempt a direct `piercing-shot` against a camouflaged target and get
  refused, wasting its turn's action. The bot's candidate list is not filtered here; if this proves a
  real problem in playtest, it is a small follow-up to `backend/game-server/src/bot.ts`, not part of this
  fix — the engine's refusal is the correctness boundary (CLAUDE.md rule 2: the server is the authority),
  and the bot wasting an action is a quality-of-play issue, not a rules bug.
- Any change to AoE behavior (`radius > 0` still reaches a camouflaged unit, unchanged, per the surviving
  half of decision 2A).
- Any change to `heal`, `terrain`, `revive`, or the new `buff` kind's targeting of a camouflaged unit —
  I1 keeps those untouched.

## Test strategy

| Case | Where | Why there |
|---|---|---|
| The refusal itself, the AoE exception, the beneficial-effect exception (I1) | `backend/engine` | Pure, deterministic rule |
| The aim highlight no longer offers the hidden unit's cell for a direct damaging ability, still offers it for an AoE one | `frontend` unit tests | Pure logic, mirrors the engine rule |
| A whole bot match unaffected in its outcome by the new refusal (the bot picks a different action instead) | `backend/game-server/src/integration.test.ts`, if a case already exercises this; otherwise noted as a gap, not a blocker | Confirms the bot does not deadlock on the refusal |

## Dependency notes

- **m1 depends on nothing external**, beyond ADR 0025 being written and accepted before the code (same
  rule `secondary-abilities` and the sibling `piercing-and-bless` follow).
- **m2 depends on m1 approved** — it mirrors the exact rule m1 ships, so the highlight and the server
  never disagree (the same guarantee `highlight.ts`'s own header comment already states for every other
  area it paints).
