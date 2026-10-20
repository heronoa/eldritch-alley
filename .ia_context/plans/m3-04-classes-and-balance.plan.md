# Plan — m3-04 · Classes and balance

**Milestone:** m3-04
**Parent feature:** m3-rules-and-content
**Created:** 2026-10-07
**Status:** pending

## 1. Objective

The three classes stop being a first guess. A headless harness plays bot-versus-bot matches across a
matrix of team compositions and fixed seeds, prints a win-rate report, and the numbers it points at
are adjusted until no class dominates. The report is the evidence the playtest of m3-05 then checks
against real players. This closes DT-15 and EA-11.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/game-server/src/balance/compositions.ts` | create | The teams the matrix plays, drawn from the three classes |
| `backend/game-server/src/balance/play.ts` | create | `playMatch(setup)`: the engine loop both sides driven by `chooseBotAction`, until a side is out. Pure and headless |
| `backend/game-server/src/balance/report.ts` | create | The table: win rate per class, per matchup and per map, plus rounds and damage dealt |
| `backend/game-server/src/balance/run.ts` | create | The entry point of `npm run balance` |
| `backend/game-server/src/balance/play.test.ts`, `report.test.ts` | create | Section 4 |
| `backend/game-server/package.json` | modify | The `balance` script |
| `backend/game-server/src/map.ts` | modify | `rosterFor(spawns, composition)`; `CLASS_SPECS` numbers adjusted by what the report shows |
| `backend/game-server/src/map.test.ts` | modify | A composition builds the squad it names, and the default composition is unchanged |
| `backend/game-server/src/abilities.ts` | modify | Costs, ranges and amounts adjusted by the report |
| `backend/engine/src/cover.ts`, `facing.ts`, `height.ts` | modify | The three tables adjusted by the report |
| `backend/engine/src/*.test.ts` | modify | The fixtures that name an adjusted number |
| `.ia_context/inputs/balance-m3.md` | create | The report, with the date, the seeds and every change made because of it |

## 3. Contract of the layer

**`playMatch(setup)`** — pure given its setup: `newMatch`, then `chooseBotAction` for whichever team
is on turn, applied through `applyAction`, until `isGameOver` or a step limit. It answers
`{ winner, rounds, eventCount, damageByClass }`. The same setup always gives the same answer, and
that is what makes the report reproducible.

**The report** — one row per matchup, each played over a fixed seed range. Because the map is a pure
function of the seed (`mapFor`, `backend/game-server/src/map.ts:72`), a seed range covers all three
maps evenly without a second axis.

**The matrix** — teams of three drawn from the three classes, with the mirror matches (`AAA` versus
`AAA`) played first, as the control. `AAA` here means the class names of `CLASS_ORDER`, not
identical units: a composition is a list of three class names.

**What this layer does not do.** It does not change a rule, only the numbers inside rules already
approved. It does not touch the client, and it does not decide what "balanced" means for a human
player: that is m3-05.

## 4. Tests planned

**Harness (`play.test.ts`, `report.test.ts`)**
- [ ] The same setup played twice gives the same winner, the same rounds and the same event count.
- [ ] A match that starts with one side already unable to act ends at once, with a defined winner.
- [ ] The step limit stops a match that never resolves, and the report counts it as a draw rather
      than as a win for either side.
- [ ] The report totals add up: every matchup's win rates sum to 100, and the per-class rates are the
      means of the matchups that class played.
- [ ] The harness never calls a Room: it runs on the engine and the bot alone, so it needs no server.

**Server (`map.test.ts`)**
- [ ] A composition of `['sniper', 'sniper', 'priest']` builds two snipers and a priest, on the map's
      three spawns, with the ids the composition names.
- [ ] The default composition still builds the roster of M2, so nothing changes for a normal match.

**Bands asserted, not printed**
- [ ] No class wins more than 60% of the matchups it plays, and none wins less than 40%.
- [ ] Every class is on the winning side of at least one matchup in the matrix.
- [ ] No matchup on any single map flips the aggregate band by more than 10 points.

These three are the definition of done of the milestone; they belong in the test suite, not in a
transcript someone reads once.

## 5. Dependencies

- m3-01, m3-02 and m3-03 merged. There is nothing to measure before them.
- The bot of m3-03, which is what plays every match in the matrix. It stays deterministic; EA-10
  (difficulty levels) is not required and stays open.
- The three maps, as delivered in M2. They are not edited here: a map change is not a balance
  adjustment, and the owner approved them.

## 6. Out of scope

- The roster. Three classes, as the owner decided on 2026-10-07; Initiate, Adept and Assaulter stay
  data for later.
- New rules. A result that seems to need one is a finding for the playtest and a new plan, not an
  adjustment here.
- EA-10 (bot difficulty and anti-camping) and EA-9 (bot pacing). Both are about how the bot feels to
  play against, and neither changes what it wins with.
- Balance of the Nerve and Attunement system from the pitch's post-MVP section. Nothing in the MVP
  reads them.

## 7. Decisions

**D1 · What the report measures.** Per class: win rate, share of the total damage, and survival rate
at the end of the match. **Recommended**: those three separate a class that wins by killing from one
that wins by outlasting, and they are cheap to collect from the events the match already produces.
Alternative: win rate alone, which is simpler but hides the reason.

**D2 · The seed range.** 30 seeds per matchup, which is ten per map. **Recommended**: cheap enough to
re-run on every adjustment, wide enough that one lucky map does not decide a class. Alternative: 300,
which is a slower loop but a tighter interval; the harness takes the range as an argument, so it can
be raised for the final report without a code change.

**D3 · What may be adjusted.** In this order: the stat lines of `CLASS_SPECS`, then the three ability
definitions, then the cover, direction and height tables. **Recommended**: the last three are rules
the player learns, and changing them to fix a class moves the problem to every other class at once.
Alternative: adjust any of them freely, which is faster to a number and worse to explain.
