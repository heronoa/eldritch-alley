# Plan — m3-05 · Playtest and closing the milestone

**Milestone:** m3-05
**Parent feature:** m3-rules-and-content
**Created:** 2026-10-07
**Status:** pending

## 1. Objective

Ten matches against the bot, played in the browser on the balanced build, recorded as they happen.
Each one says what the player did, what the build answered, and what was changed because of it. The
milestone is done when the winners vary, no single strategy wins every match, and the record exists.
This is also where the reconnection test that M2-b left pending is finally taken.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `.ia_context/inputs/playtest-m3.md` | create | The ten matches and the adjustments, one section per match |
| `ROADMAP.md` | modify | M3 marked done, the M2-b reconnection test recorded, the M3 bullet list brought in line with what was delivered |
| `.ia_context/inputs/technical-debt.md`, `backlog.md` | modify | DT-15 closes with the balance pass; DT-81 and DT-80 are re-checked against the new rules; anything the playtest finds is opened here with a trigger |
| `.ia_context/plans/m3-rules-and-content.index.md` | modify | Every milestone marked with its PR |
| Follow-up plans | create | Only if a finding needs rules rather than numbers |

## 3. Contract of the layer

**A match record** carries: the date, the map and the seed, the composition of both sides, the
difficulty, who won, how many rounds it took, what the player tried, what surprised them, and the
adjustment the match produced (or an explicit "no change"). A record with no adjustment and no
observation is not a record.

**An adjustment** is one of: a number changed in the data (with the commit that changed it), a
finding that becomes a plan, or a debt opened with a trigger. Nothing is "we will see".

**What this layer does not do.** It does not change a rule inside this milestone. A rule change
found here is a new plan, in the same way a rule change to an approved layer has always been
handled in this project.

## 4. Tests planned

This milestone has no unit tests. It has an acceptance checklist, which is what the roadmap asks for:

- [ ] Ten matches played, each recorded while it was played, not reconstructed afterwards.
- [ ] At least three different winners across the ten, and no composition that wins every time.
- [ ] Every adjustment traced to a commit or to a new plan, and the numbers before and after.
- [ ] The bot-versus-bot report of m3-04 (`npm run balance`) re-run on the final build, and its
      bands still holding.
- [ ] **Carried from M2-b:** with a real room, one turn left idle for more than two minutes over the
      tunnel, and a forced drop recovered by reconnecting. The result recorded in `ROADMAP.md` § M2-b.
- [ ] A match played on the published build, not only on localhost.

## 5. Dependencies

- m3-01 to m3-04 merged, and the published build carrying them.
- The reconnection test needs the deployed environment of M2-b. If the tunnel is not up, that item is
  the one blocker of this milestone, and it is recorded as such rather than skipped silently.

## 6. Out of scope

- PvP. The playtest is against the bot, as the roadmap's M3 line asks; two humans is M5.
- Accounts, persistence and replays (M4).
- New content: classes, abilities, maps. The playtest measures what exists.
- Balance against human opponents: ten matches by one player is a signal, not a sample, and the
  roadmap asks for a signal.

## 7. Decisions

**D1 · What varies between matches.** The player picks the map and the composition each time, and
plays the same build. **Recommended**: it is what an ordinary player does, and it is the only way the
ten matches say anything about the game rather than about one opening. Alternative: one fixed setup
played ten times, which measures consistency but not variety.

**D2 · Where the findings go.** Numbers go to `.ia_context/inputs/balance-m3.md` as an appended
report; rule findings become plans; anything left undone becomes a debt item with a trigger.
**Recommended**: it keeps the three lists doing what their headers already say they do. Alternative:
one long playtest document holding everything, which is easier to write and harder to act on.

**D3 · Who plays.** The owner. **Recommended**: the roadmap's done-when is about a strategy not
dominating, and only the person who will judge the game can answer that. A bot recording the ten
matches would answer a different question, and that question is already m3-04's.
