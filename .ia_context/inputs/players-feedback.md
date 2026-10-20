# Eldritch Alley: Tactics, playtest 1 tickets

Source: first external playtest (friends, Proxmox build), plus the roadmap items already planned before the AWS deploy.

Epic: **Playtest 1 feedback**. Ticket keys are placeholders (`EA-n`); Jira assigns the real ones.

## Overview

| Key | Type | Title | Priority | Depends on |
|---|---|---|---|---|
| EA-1 | Bug | Line of sight is wrong on two maps (through buildings, blocked across the rooftop gap) | Highest | |
| EA-2 | Bug | Movement range shows unreachable cells | Highest | |
| EA-3 | Story | Turn indicator for the active unit | Highest | |
| EA-4 | Story | Automatic end of turn, with a setting to disable it | Highest | |
| EA-5 | Story | Show full movement and attack range of the selected unit | High | EA-2 |
| EA-6 | Story | Show enemy ranges on hover or tap | High | EA-5 |
| EA-7 | Story | Multi-cell movement with path preview | High | EA-2 |
| EA-8 | Story | Attack by clicking the target's sprite or portrait | High | |
| EA-9 | Story | Bot turn pacing | High | EA-3 |
| EA-10 | Task | Bot behavior: stop camping, add difficulty levels | High | EA-1 |
| EA-14 | Story | Ranged basic attack and mana for magic classes | High | |
| EA-11 | Spike | Re-check class balance | Low | EA-1, EA-14, EA-10 |
| EA-12 | Story | Camera: rotation, pan and zoom | Medium | |
| EA-13 | Story | First Wizard and Priest spells | After deploy | EA-5, EA-7, EA-14, AWS staging deploy |

**Milestones:** every ticket except EA-13 comes before the AWS staging deploy with Terraform. The spells (EA-13) come after it. The magic classes' basic ranged and melee attacks (EA-14) stay before the deploy.

Suggested order: the two bugs first, then the onboarding pair (EA-3, EA-4), then the magic classes' ranged attack (EA-14), then ranges and movement (EA-5 to EA-8), then the bot (EA-9, EA-10). Balance (EA-11) is only re-checked at the end.

**Why the Sniper dominates today:** its numbers are as designed (highest damage and range). It dominates because the Wizard and the Priest only have a melee attack in the current build (the ranged basic attacks exist only in the animation prototype), and because line of sight is wrong: on the alley map shots pass through buildings (helping the Sniper), and on the rooftop map shots across the gap between buildings are blocked. EA-1 and EA-14 address the cause; EA-11 confirms the result.

---

## EA-1 · Bug · Line of sight is wrong on two maps

**Reported and confirmed in the playtest:**
- **Alley map:** shots pass through buildings.
- **Rooftop map:** a unit cannot shoot a unit on the other building, across the open gap. There is no wall between the buildings, so the shot should be allowed.

The two failures go in opposite directions, which suggests the check does not use the right property of each cell rather than one isolated mistake.

**Expected model:** line of sight is decided by height, as defined in ADR 0005 (Bresenham, integer math). The line from the attacker to the target is blocked by a cell only if that cell's top (terrain or obstacle) is higher than the line at that point.
- Buildings block, because they are tall.
- The gap between buildings never blocks: it is the lowest point of the map. A cell can be impossible to walk on and still be transparent.
- Blocking props (cars, dumpster, crates, trees, fountain, water tower) block according to their own height.
- A unit on higher ground sees over lower obstacles.

**Acceptance criteria**
- "Blocks movement" and "blocks sight" are separate properties of tiles and props. Today's walkable/blocked flag must not be reused for sight.
- The check lives in the engine and is used by both the server validation and the client preview.
- An attack command on a target without line of sight is rejected by the server with a clear reason.
- Regression tests with the exact shots from the playtest: through a building on the alley map (must fail) and across the rooftop gap (must succeed).
- More tests: the alley T-junction, a target behind a car, a target behind a building corner, and a shot from a rooftop over a low wall.

**Investigation:** the failures are confirmed; the cause is not yet known. Check, in this order:
- whether the check reads walkability instead of height (this alone would explain both cases: the void cells are not walkable, and buildings might be read as something else);
- whether building heights from the map data reach the check (the alley map defines heights with a function, unlike the others);
- whether the void cells' height (far below the rooftop) is used, or whether they are treated as solid;
- whether the park map has similar failures that nobody has hit yet.

## EA-2 · Bug · Movement range shows unreachable cells

**Reported:** "Don't show movement that is impossible (on top of buildings)."

**Expected:** the highlighted movement range only contains cells the unit can actually reach.

**Acceptance criteria**
- The reachable set excludes buildings, blocking props, occupied cells, and steps with a height difference greater than 1.
- Reachability is computed by the engine (pathfinding over movement points), not by distance alone.
- The client preview and the server validation use the same function.
- Unit tests for each exclusion rule.

**Note:** check whether the server also accepts these moves. If only the preview is wrong, this is a display bug; if the server accepts them, units can actually walk onto buildings, and the fix is more urgent.

## EA-3 · Story · Turn indicator for the active unit

**Reported (earlier playtest):** first-time players cannot tell whose turn it is and think the game is stuck.

**Acceptance criteria**
- An arrow floats above the active unit, in its team color.
- A banner appears at each turn change ("Sua vez" / "Vez do inimigo") and fades out on its own.
- The active unit's portrait is highlighted in the turn queue.
- Other units are slightly dimmed during a unit's turn.

## EA-4 · Story · Automatic end of turn, with a setting to disable it

**Reported (earlier playtest):** players don't know they must press "End turn" and think the game is stuck.

**Acceptance criteria**
- When the active unit has spent its movement (or has no reachable cell left) and its action, a short notice appears ("Turno encerrado em 2 s") with a cancel button, then the turn ends.
- The turn does not end automatically while the action is still available, even with no target in range (reload and meditate are valid choices).
- With the setting off, the "End turn" button pulses and shows a hint once nothing else can be done.
- The "can this unit still act?" check lives in the engine.
- The setting is on by default and stored in the browser until accounts exist.

## EA-5 · Story · Show full movement and attack range of the selected unit

**Reported:** "Show all possible movement of the character, and its attack range."

**Acceptance criteria**
- Selecting a unit shows its reachable cells in one color and the cells it can attack from its current position in another.
- Optional toggle for threat range: every cell the unit could attack after moving.
- Attack range respects line of sight (EA-1).

## EA-6 · Story · Show enemy ranges on hover or tap

**Reported:** "Let me see the enemy's too when I hover over it."

**Acceptance criteria**
- Hovering (desktop) or tapping (mobile) an enemy shows its movement and attack range with the same visuals as EA-5, in the enemy color.
- It does not change the selected unit or consume any action.

## EA-7 · Story · Multi-cell movement with path preview

**Planned:** move several cells in one action instead of one click per cell.

**Acceptance criteria**
- Hovering or first-tapping a reachable cell shows the path and its cost; clicking or second-tapping confirms.
- The client sends only the destination; the server recomputes the path and returns it in the event.
- The unit is animated walking cell by cell along the returned path.

## EA-8 · Story · Attack by clicking the target's sprite or portrait

**Reported:** "Be able to attack by clicking anywhere on the character, or on its portrait at the top."

**Acceptance criteria**
- In attack mode, clicking anywhere on an enemy's sprite (not only its floor cell) selects it as the target.
- Clicking an enemy's portrait in the turn queue also selects it.
- If the target is invalid (out of range, no line of sight), the reason is shown instead of nothing happening.

## EA-9 · Story · Bot turn pacing

**Acceptance criteria**
- The bot pauses briefly between moving and attacking, so a player can follow what happened.
- The camera follows the acting bot unit once EA-12 is done.
- A "Vez do inimigo" banner is shown (EA-3).

## EA-10 · Task · Bot behavior: stop camping, add difficulty levels

**Reported:** "Make the AI dumber so it doesn't camp."

**Problem:** the issue is less the bot's strength than its behavior: it stays in a safe position and waits. A dumber bot would still camp.

**Acceptance criteria**
- The bot's evaluation rewards advancing toward the objective or the enemy, not only safe positions.
- After a few turns without engaging, the bot is pushed to advance.
- Difficulty levels, with "Easy" as the default for new players: on Easy, the bot sometimes picks a reasonable move instead of the best one.
- The bot's choices stay deterministic for a given seed (replays must still work).

## EA-11 · Spike · Re-check class balance

**Reported:** "Nerf the sniper (or buff the others)."

**Context:** the Sniper's numbers are as designed. Its dominance today comes from the magic classes having no ranged attack (EA-14) and from shots passing through buildings (EA-1). Do not change the Sniper before those two are done.

**Do after EA-1, EA-14 and EA-10.** Play a few matches and compare the classes. Only if the Sniper still dominates, evaluate:
- Lower base damage, keeping the height bonus as its main strength.
- Smaller ammo capacity, so reloading competes with shooting.
- Buffs to the others, for example more movement for the Combatant.

**Output:** a short note with numbers from the test matches; an ADR if a rule changes.

## EA-14 · Story · Ranged basic attack and mana for magic classes

**Context:** in the current build, the Wizard and the Priest (and the Initiate and the Adept) only attack in melee. The ranged basic attacks were designed and animated in the characters handoff (`eldritch-alley-characters-v1`) but are not in the game yet.

**Acceptance criteria**
- One basic attack per class with the same effect and cost at any distance; only the animation changes (melee animation when the target is adjacent, ranged from two cells away).
- Magic classes use mana as ammo: every basic attack spends mana at both distances, and their melee animations release a little magic on impact.
- Meditation is the magic classes' reload: it uses the action and refills mana to full (arcane: magic circle; faith: light beam).
- Ranges are data per class; ranged attacks respect line of sight (EA-1).
- Animations and timings follow the characters handoff: Wizard magic missiles, Priest sky column, Initiate spark, Adept beam.

## EA-12 · Story · Camera: rotation, pan and zoom

**Reference:** `eldritch-alley-mapas-mobile` prototype.

**Acceptance criteria**
- Pan by dragging, pinch and wheel zoom in integer steps (1x to 4x).
- Rotation in 90° steps with a short animation; client-only, the engine does not change.
- Sprites always face the camera, mirrored toward the enemy team.
- Tall buildings with playable area behind them are cut down in the current view; buildings covering a unit or the selected cell turn translucent.
- Switching maps resets the view to N.

## EA-13 · Story · First Wizard and Priest spells

**Milestone:** after the AWS staging deploy with Terraform. Before the deploy, the Wizard and the Priest only get their basic ranged and melee attacks (EA-14).

**Scope:** two spells per class, which already exercise the whole structure.
- Priest: Heal and Silence.
- Wizard: Ignition and Oil Slick (fire on oil explodes).

**Acceptance criteria**
- Spells are data: cost, range, area, effects.
- Per-spell mana cost, on top of the mana pool from EA-14.
- Status effects with duration and end conditions; cell surfaces (oil, fire).
- The interaction table (fire + oil) is data, resolved once per action, with no chain reactions.
- Area and target preview reuses the range preview from EA-5.