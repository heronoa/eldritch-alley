# Index — M3 · Rules and content

**Created:** 2026-10-07
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) § M3. Rules and content
**Status:** awaiting approval

## Scope of the milestone

M3 closes the rules the pitch describes and turns the classes into content read from data. The
roadmap lists seven lines; what each one needs today:

| Roadmap line | State before M3 | Milestone |
|---|---|---|
| Line of sight | Done in EA-1 (`backend/engine/src/sight.ts`), integer Bresenham, symmetric | — |
| Cover (walls, crates, cars) | **Nothing.** Props are cosmetic, live in two hand-synced copies and are erased before the engine (`boardOf`, `backend/game-server/src/map.ts:52`) | m3-01 |
| Direction bonus | **Nothing.** `Unit` carries no `facing` | m3-02 |
| Height advantage | **Nothing.** The level is read by movement and sight only, never by a hit | m3-02 |
| Resources | Ammunition and mana are done (ADR 0011). **Mana does not regenerate** | m3-03 |
| Abilities and classes as data | **No ability exists.** `Abilities` is a type carried since M1 that no rule reads. The three classes are data in `CLASS_SPECS` (`backend/game-server/src/map.ts:97`) | m3-03 |
| Balancing of the three classes | Never done (EA-11, DT-15) | m3-04 |
| Map with contested high points, cover and two routes | **Delivered early in M2 and approved.** M3 delivers no map (owner, 2026-10-07) | — |
| Playtest: ten matches against the bot, recorded | Never done | m3-05 |
| Universe decision | **Own universe** (owner, 2026-10-07). No renaming follows | — |

## Milestones

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [m3-01-cover.plan.md](./m3-01-cover.plan.md) | [ ] pending | — |
| 2 | [m3-02-facing-and-height.plan.md](./m3-02-facing-and-height.plan.md) | [ ] pending | — |
| 3 | [m3-03-abilities.plan.md](./m3-03-abilities.plan.md) | [ ] pending | — |
| 4 | [m3-04-classes-and-balance.plan.md](./m3-04-classes-and-balance.plan.md) | [ ] pending | — |
| 5 | [m3-05-playtest.plan.md](./m3-05-playtest.plan.md) | [ ] pending | — |

## Dependency notes

- **m3-01 depends on nothing.** It is the first because both later rules fold into the same function
  (`resolveHit`, `backend/engine/src/actions.ts:30`): landing cover first keeps m3-02 a clean rebase.
- **m3-02 depends on nothing**, but its diff touches the same function as m3-01. Land it after, not
  in parallel.
- **m3-03 depends on m3-01**: the Wizard's area ability is defined as ignoring cover, which has no
  meaning until cover exists.
- **m3-04 depends on m3-01, m3-02 and m3-03**: there is nothing to balance until the rules are in.
- **m3-05 depends on m3-04**: the ten matches are played on the balanced build.
- Each milestone is one branch and one PR, in the order above. No milestone is a prerequisite for
  reviewing the next one on paper; only for merging.

## ADRs this index opens

Accepted ADRs are not rewritten (ADR README). Each new rule gets its own record; ADR 0011 is amended
by a later one rather than edited.

| ADR | Decision | Milestone | State |
|---|---|---|---|
| 0012 | Cover and typed props on the board | m3-01 | to write |
| 0013 | Facing and the direction bonus | m3-02 | to write |
| 0014 | Height advantage | m3-02 | to write |
| 0015 | Abilities as data | m3-03 | to write |
| 0016 | Mana regeneration (amends 0011) | m3-03 | to write |

## Documentation debt found while planning

- `docs/adr/README.md` lists the records up to 0009; **0010 and 0011 exist as files but are missing
  from the table**. `ROADMAP.md` § Decisions stops at 0006. Both are one-row fixes, worth taking in
  the m3-01 PR.
- `ROADMAP.md` § M3 still asks for a map and lists mana regeneration as a resource line. The first
  is already delivered (owner, 2026-10-07); the second moves into m3-03 with ADR 0016.
- `ROADMAP.md` § M2-b keeps the reconnection test through the tunnel as pending. The owner approved
  M2 on 2026-10-07, so it does not block planning; it is carried as an acceptance item of m3-05,
  which is the first milestone played on a published build.

## Decisions already taken (owner, 2026-10-07)

| # | Question | Answer |
|---|---|---|
| B1 | Is M2 approved? | Approved. The pending tunnel reconnection test moves into M3's acceptance |
| B2 | Which universe? | Its own. Names, tone and art stay as they are |
| B3 | How far do abilities go? | One active ability per class |
| B4 | How is cover modelled? | Typed props on the engine board |
| B5 | How does facing change? | Chosen at the end of the turn, N/S/E/W; otherwise the direction of the last action. The sprite only mirrors left/right; a V arrow always shows the true facing |
| B6 | What do direction and height change? | Direction: hit and damage. Height: range and accuracy (pitch § Combat) |
| B7 | Does mana regenerate? | One point per turn |
| B8 | How is balance measured? | Bot-versus-bot simulation plus the ten matches |
| B10 | Which roster? | The three classes. The data format must still take more without an engine change |
| B11 | Which map? | None. The three maps were delivered and approved in M2 |
