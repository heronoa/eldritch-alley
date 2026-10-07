# 0017. Mana regenerates one point at the start of the turn

**Status:** Accepted (2026-10-07). Amends ADR 0011, decision 5.

## Context

ADR 0002 gave the magic classes a pool that "regenerates a little each turn" and left the mechanics to
M3. ADR 0011 §5 made the M2 scope concrete by removing regeneration altogether: a magic class refilled
its pool only by meditating, and meditating spends the unit's action.

m3-03 gives each class an active ability that costs 2 points of a pool of 3 (ADR 0016). With meditation
as the only way back, a Wizard would spend one turn in two refilling instead of acting, and its ability
would be a move it makes every other turn at best. The pool has to come back on its own.

## Decision

1. **One point, at the start of the unit's own turn.** The engine opens a turn by handing the initiative
   to the next unit, so the point is resolved as part of the `endTurn` that hands the turn over, for the
   unit that receives it. A unit never regenerates at the end of its own turn.
2. **Magic pools only.** A unit whose `resourceKind` is `mana` regenerates; an ammunition class does
   not. The Sniper's magazine comes back through reload (an action, ADR 0011 §3), and that stays the
   only way.
3. **Capped at the capacity.** The pool never rises above the class's capacity (ADR 0011 §4: 3). A unit
   already at the ceiling regenerates nothing.
4. **Only when a point is actually regained.** A unit at its ceiling, an ammunition class and a unit
   that never comes on turn emit no event at all. The event is not a per-turn heartbeat.
5. **The event is `regained`, right after `turn-ended`.** `{ actor, resource, amount }`. The client
   reads it to write the log line and a replay reads it instead of inferring the point from the turn
   order, so what the player saw and what the replay shows are the same bytes.
6. **No rng draw.** The amount is a constant of the rule, not a roll, so regeneration cannot shift the
   stream of draws a match makes (ADR 0005).
7. **A unit that does not take the turn regains nothing.** A defeated unit, and a body whose death has
   become permanent and left the initiative, are never handed a turn, so there is no start of turn to
   regenerate at.
8. **This amends ADR 0011 §5 and nothing else.** The rest of 0011 stands: every basic attack spends the
   class's resource at any distance, no resource means no attack (`no-mana`, `no-ammunition`), and
   meditation refills the pool to full for the unit's action.
9. **`PROTOCOL_VERSION` rises to 9** — 8 being what ADR 0014 and ADR 0015 take. The `regained` event
   travels to the client, so a build that does not know it cannot read a match that has one.

## Consequences

- A magic class that has just spent its pool comes back to a point it can act on: with a capacity of 3
  and an ability that costs 2, the class alternates between casting and meditating rather than
  meditating twice for every cast.
- Meditation keeps its place as the way to refill in one action, and the ability to cast does not remove
  the reason to use it.
- The log gains one sentence, and the client needs a key for it in both catalogs (ADR 0009).
- The capacity, the ability costs and the rate interact directly. m3-04 is where they are tuned
  together, against this rule as written and not against a different one.
- The rule is one point per turn and not a fraction of the pool, so it stays integer (ADR 0005).
