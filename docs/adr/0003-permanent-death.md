# 0003. Permanent death within a match

**Status:** Accepted

## Context

A unit that dies could leave the match for good or return after some turns. A countdown adds a state of "out of play" with a timer, more events, and more edge cases in the initiative queue. The MVP has no progression, so there is no cost to losing a unit that the match does not already carry.

## Decision

A unit whose health reaches zero leaves the match. It is removed from the board and from the initiative queue. Resurrection exists only as an ability of the Priest class, not as a core rule.
