# 0003. Permanent death within a match

**Status:** Accepted

## Context

A unit that dies could leave the match for good or return after some turns. A countdown adds a state of "out of play" with a timer, more events, and more edge cases in the initiative queue. The MVP has no progression, so there is no cost to losing a unit that the match does not already carry.

## Decision

A unit whose health reaches zero leaves the match. It is removed from the board and from the initiative queue. Resurrection exists only as an ability of the Priest class, not as a core rule.

## Addendum: bodies and two-step resurrection (2026-10-03)

**Bodies.** A defeated unit becomes a body on its tile. The body occupies the tile and cannot be targeted. It lasts a number of rounds that depends on the unit's Nerve: 3 rounds for Nerve 0–49, 4 for 50–99, and 5 for 100. A round is one full pass of the initiative order.

When the body's time is up, the body is removed, the unit is permanently dead, and an item appears in its place. The item belongs to the post-MVP equipment drop. The death is recorded in the database, not deleted, so the character's history is kept.

If the match ends before the body's time is up, or the unit is revived, nothing permanent happens: the unit returns to its team as usual.

**Two-step resurrection (not yet implemented).**
1. The caster picks a defeated character from its own team.
2. The caster picks a tile. The tile must be on the board, inside the ability's range, and hold no living unit and no body.

The body is removed when the unit is revived, and the unit is placed on the chosen tile.
