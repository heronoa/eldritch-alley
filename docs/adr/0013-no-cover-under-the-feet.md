# 0013. A prop under the feet gives no cover

**Status:** Accepted (2026-10-07). Supersedes ADR 0012, decision 4, in the part that reads the target's
own cell.

## Context

ADR 0012 gave the target cover when a `cover` prop stood on the cell it was standing on: "it is
crouched behind it, from every direction". The rest of the rule read the eight neighbours on the
attacker's side, and the cell the attacker itself stood on was already excluded, because a shooter on
a crate has the crate under its feet.

Reviewing m3-01 the owner rejected that asymmetry (2026-10-07): a unit on top of the car is *more*
exposed than one standing away from it — it is a place to be seen from, not a place to hide — so a
prop under the feet must not be cover at all. Reading the two ends differently was also the source of
the only case in which the rule answered "covered" from every direction at once.

An accepted ADR is not rewritten (see the README), so this is a new record.

## Decision

1. **Only the eight neighbours count, for both ends of the shot.** `coverFor(board, target, attacker)`
   no longer reads the target's own cell. A `cover` prop there gives nothing, and the rest of the rule
   is unchanged: a prop on one of the eight cells around the target that lies on the attacker's side,
   `d.x * ax + d.y * ay > 0`, with `a` the sign vector from the target to the attacker.
2. **The exclusion of the attacker's own cell stays.** It is the same statement read from the other
   end, and the rule is now symmetric: a prop under the feet of either end is not between the two.
3. **The neighbours still count.** A unit standing on a crate with another crate beside it, on the
   attacker's side, is in cover as any other unit would be — the crate under it is what stops
   counting, not the ground it stands on.
4. **The cell under the feet is not read as cover anywhere.** The badge a unit wears (EA-15) reads the
   same eight cells, so the screen and the rule keep saying the same thing.

## Consequences

- The hit chance against a unit on a crate rises to what the board around it gives it, which is what
  the owner asked for when he read the rule.
- `COVER_HIT_PENALTY`, `Board.props`, the prop kinds and the maps are untouched; only the clause that
  read the target's cell is gone.
- The engine's behaviour changes, so a replay recorded before this ADR resolves a shot at such a unit
  differently. No match recorded so far is kept, and m3 is still in development, so nothing is
  migrated.
- The badge and the log line that name cover now agree with the rule by construction: they read the
  same neighbours (EA-15).
