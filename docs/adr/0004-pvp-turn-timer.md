# 0004. PvP turn timer

**Status:** Proposed

## Context

PvP matches need a limit on how long a player can hold the turn, both to keep matches moving and to handle disconnected or inactive players. The right value depends on how long a turn takes in practice, which only playtesting will show.

## Decision

Start with a 30-second turn timer as a hypothesis. Revisit it after the M3 playtest and before M5 ships PvP. This ADR moves to Accepted with the value that the playtest supports.
