# 0004. PvP turn timer

**Status:** Accepted

## Context

PvP matches need a limit on how long a player can hold the turn, both to keep matches moving and to handle disconnected or inactive players. The right value depends on how long a turn takes in practice, which only playtesting will show.

## Decision

Turn timer of 30 seconds. The owner confirmed it on 2026-10-03: long enough to be fair, short enough to keep the match dynamic. The same timer bounds the reaction window (ADR 0007). The value is data, so the M3 playtest can change it without changing the rules.
