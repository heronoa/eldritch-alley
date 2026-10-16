# 0001. Individual initiative

**Status:** Accepted

## Context

The pitch describes turns where a unit can move and act, in any order, and where the order comes from each unit's speed, shown to both sides. A team-based turn (the whole team acts, then passes) is simpler to validate and synchronize, but it removes the positional decision per unit that the game is built around.

## Decision

Each unit acts on its own turn. Turn order follows speed, from highest to lowest. Ties are broken deterministically; the exact tie-break rule is defined in the M1 plan. The initiative queue is public state, visible to both sides.
