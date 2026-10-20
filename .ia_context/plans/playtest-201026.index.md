# Index — Playtest 2026-10-20 feedback

**Created:** 2026-10-20
**Input:** [.ia_context/inputs/playtest-201026](../inputs/playtest-201026)
**Status:** pending — waiting for the owner's approval of this index and of each milestone's own plan

## What this delivery covers

Four unrelated playtest notes, bundled under one index only because they came from the same session —
each milestone below is reviewable and shippable on its own, in any order, on its own branch.

1. **Tutorial copy** — the "Your Squad" onboarding card reads as AI-generated filler; reword its closing
   sentence.
2. **AoE area highlight** — selecting an area ability shows its range as text only; highlight the actual
   footprint tiles so the player sees what a cast at the hovered cell would cover.
3. **Piercing Shot cost + Priest's Bless** — the sniper's single-target ability becomes more expensive,
   and the Priest gains a new buff ability. This is the heaviest item: a new engine effect kind, a third
   active-ability slot (generalized to every class), and a protocol bump.
4. **Camouflage vs. single-target abilities** — today only basic attacks are refused against a
   camouflaged unit (ADR 0023 §6, decision 2A); a damaging ability with no radius can still name its cell
   directly. The playtest wants that closed: a direct ability shot is refused the same way a basic attack
   is, and only a splash (`radius > 0`) still reaches the hidden unit.

## Milestones

| # | Item | Plan | Layers | Status | PR |
|---|------|------|--------|--------|----|
| 1 | Tutorial copy | [playtest-201026-m1-tutorial-copy.plan.md](./playtest-201026-m1-tutorial-copy.plan.md) | frontend | [ ] pending | — |
| 2 | AoE area highlight | [playtest-201026-m2-aoe-area-highlight.plan.md](./playtest-201026-m2-aoe-area-highlight.plan.md) | frontend | [ ] pending | — |
| 3 | Piercing Shot cost + Bless | [playtest-201026-m3-piercing-and-bless.index.md](./playtest-201026-m3-piercing-and-bless.index.md) | engine, game-server, frontend | [ ] pending | — |
| 4 | Camouflage vs. abilities | [playtest-201026-m4-camouflage-targeting.index.md](./playtest-201026-m4-camouflage-targeting.index.md) | engine, frontend | [ ] pending | — |

Milestones 3 and 4 are themselves indexes with their own sub-milestones, by layer, following the same
convention as `secondary-abilities.index.md`. Milestones 1 and 2 are single plans: one layer, contained
change, no incremental-review need.

The four milestones are **independent of each other** — none blocks another, since they touch disjoint
files except where noted in milestone 3's own index (its engine work touches the same `activeSets` shape
that milestone 4 does not touch). They can be worked in any order, or in parallel on separate branches.
The plan runner must still check each milestone's (and sub-index's) own status before starting its next
unresolved step, as the workflow requires; a milestone in review blocks only its own sub-index's next
step, never a sibling top-level milestone.

## Decisions taken (owner, 2026-10-20)

| # | Question | Answer |
|---|---|---|
| D1 | Plan shape | **Index with four milestones**, one per playtest item |
| D2 | Priest's third ability slot | **Generalize the ability menu to three slots for every class** (Sniper, Wizard, Priest), not just a Priest-only exception. Only the Priest gains a new ability in this delivery; Sniper's and Wizard's third slot stays `null` |
| D3 | Bless's duration model | **N turns, counted down like Camouflage** (a status with a countdown on `UnitState`, recast refreshes rather than stacks) |
| D4 | Who Bless can target | **Any living ally in range**, the same shape as `area-heal` — not restricted to the Sniper or to self-cast |

## Scope

- Reword one onboarding card's copy, in both locales.
- Paint the footprint of an armed area ability at the hovered cell.
- Raise `piercing-shot`'s cost from 1 to 2 (of the Sniper's own ammunition pool, ADR 0002).
- A new `buff` effect kind, a new `bless` ability for the Priest, a third (generalized) active-ability
  slot, and everything downstream of those (bot, protocol, client menu, client visuals).
- Closing the single-target-ability camouflage gap in `validateUseAbility`, and matching the frontend's
  aim highlight to it.

## Out of scope

- Any other playtest note not in the four items above.
- Rebalancing beyond the two numbers the feedback gives (Piercing Shot's cost, Bless's +10%/+1).
- A fourth ability for any class, or a fourth menu row.
- Changing how the bot plays today beyond teaching it the one new ability (milestone 3) — milestone 4's
  fix may cause the bot to attempt and get refused on a camouflaged cell; see that sub-index's own "Out
  of scope" for why this is accepted rather than fixed here.

## Commit groups (proposal for when the work is done)

Each milestone (or sub-milestone) is its own reviewable unit. The owner writes and pushes every commit;
a plausible split, one group per shipped milestone:

1. `feat(frontend): reword the tutorial's squad card` — milestone 1.
2. `feat(frontend): highlight an area ability's footprint on hover` — milestone 2.
3. `docs(adr): record the third ability slot and Bless` + `feat(engine): add the buff effect and a third
   active set` + `feat(server): ship Bless and raise Piercing Shot's cost` + `feat(frontend): offer Bless
   and draw its status` — milestone 3's four sub-milestones.
4. `docs(adr): block single-target abilities against camouflage` + `feat(engine): refuse a direct
   ability shot at a camouflaged unit` + `feat(frontend): stop offering a camouflaged unit's cell as an
   ability aim` — milestone 4's two sub-milestones.

The exact split follows the final diff; each (sub-)milestone above is also a review boundary.
