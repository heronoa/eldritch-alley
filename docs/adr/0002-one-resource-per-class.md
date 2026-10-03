# 0002. One resource per class

**Status:** Accepted

## Context

Weapon classes depend on ammunition and magic classes depend on mana. Giving each unit both resources would double the state to validate, replicate and replay, and would make every ability ask which pool it spends.

## Decision

Each class uses exactly one resource. Weapon classes use ammunition, which is restored by a reload action. Magic classes use mana, which regenerates a little each turn. No unit has both.
