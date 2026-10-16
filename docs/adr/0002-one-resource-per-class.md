# 0002. One resource per class

**Status:** Accepted

## Context

Weapon classes depend on ammunition and magic classes depend on mana. Giving each unit both resources would double the state to validate, replicate and replay, and would make every ability ask which pool it spends.

## Decision

Each class uses exactly one resource. Weapon classes use ammunition, which is restored by a reload action. Magic classes use mana, which regenerates a little each turn. No unit has both.

## Addendum: reload, empty magazine and scope (2026-10-03)

- **Reload costs the action, not the movement.** A unit that reloads spends its action for the turn and does not spend its movement. Under the move-then-act rule (M1, DT-09), it may move before reloading but not after. **To confirm:** the owner's answer said "before or after"; the code follows the move-then-act rule until the owner decides.
- **Empty magazine.** An attack with no ammunition is not rejected. The unit may make a melee attack instead: range 1 (adjacent), damage equal to half of its attack, rounded down. The melee attack spends the action like any attack.
- **Scope.** Ammunition is implemented in M2-a for the Sniper, and the mechanism is generic: any class with a magazine uses it. The Assaulter is a data definition for M3; it does not enter the M2 roster.
- **Magic classes at M2.** The basic attack of Wizard and Priest costs no mana. Mana comes with abilities in M3.
