# 0007. Reaction abilities

**Status:** Accepted

## Context

Some abilities are not used on the unit's own turn. They trigger during another unit's action: a counterspell interrupts an enemy spell, and a counter-attack answers a blow. The pitch lists counter and overwatch as reactions, and the owner's spec adds Nerve as the source of reaction slots. The engine has no reaction window yet, so the rule needs to be fixed before M3 implements it.

## Decision

**What a reaction is.** A reaction is an ability that triggers from an event produced by another unit's action. It is not used during the unit's own turn.

Examples:
- **Counterspell:** an enemy casts a spell. The counterspell deals damage to the caster and stops the spell from resolving. It costs one reaction slot.
- **Counter-attack:** a unit takes a blow. It may strike back. It costs one reaction slot.

**Reaction slots.** Each unit has reaction slots, determined by its Nerve, with a minimum of 3. More Nerve means more slots. The bands are data, not code:

| Nerve | Slots |
|---|---|
| 0–24 | 3 |
| 25–49 | 4 |
| 50–74 | 5 |
| 75–99 | 6 |
| 100 | 7 |

**Refresh.** Slots refresh at the start of the unit's own turn. A slot spent during another unit's turn stays spent until then.

**Cost.** Every reaction costs one slot for now. Later reaction skills may spend more or fewer slots; that is a property of each skill, added with the skill.

**Reaction window.** An event that can be reacted to pauses the match in a reaction window before it is applied. The state carries the pending reaction. The target player accepts or declines. The response is recorded as an event, so replay reproduces the same outcome. The window uses the response timer of the PvP turn timer (ADR 0004, 30 seconds); if the timer runs out, the reaction is declined.

**Scope.** This ADR records the rule. Implementation is M3 (DT-17 in the technical debt list).

## Consequences

- A match can be paused in the middle of an action, so the engine must accept a response that arrives after the trigger. The reaction response is one more action type, and its legality is checked like any other.
- Replay keeps working, because the pause and the response are events.
- Balance of Nerve depends on the bands; changing them means changing data, not rules.
