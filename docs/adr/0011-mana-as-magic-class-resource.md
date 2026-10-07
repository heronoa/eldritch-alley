# 0011. Mana as the magic classes' resource in M2, and no basic attack without a resource

**Status:** Accepted (2026-10-06). Amends ADR 0002.

## Context

ADR 0002 gives each class one resource. Weapon classes use ammunition, and magic classes use mana, which "regenerates a little each turn", with the mana mechanics in M3. Its addendum lets an empty magazine attack in melee, and says the magic classes' basic attack costs no mana at M2.

Playtest 1 (EA-14) shows that the Wizard and the Priest have no ranged attack, and that the Sniper with an empty magazine turns into a melee attacker. Both make the Sniper the dominant class. The owner decided on 2026-10-05 that a basic attack needs its resource, at any distance, and that the game must say why it is refused.

## Decision

1. **Every basic attack spends the class's resource, at any distance.** The unit's resource is ammunition (Sniper) or mana (Wizard, Priest). The same attack, the same effect and the same cost apply at range and in melee. Only the animation changes.
2. **No resource, no basic attack.** An attack with an empty resource is refused:
   - Sniper with an empty magazine: `no-ammunition` (the game shows "sem munição, recarregue").
   - Magic class with no mana: `no-mana` (the game shows "sem energia, medite").
   The melee fallback for an empty magazine is removed for every class.
3. **Reload is the resource's refill action.** For the Sniper it is reload. For magic classes it is meditation. Both spend the unit's action, not its movement, and refill the resource to full.
4. **Mana capacity is data.** The proposed capacity is 3, the value of the characters prototype. The owner confirms it.
5. **No regeneration.** Mana is refilled only by meditation. Abilities that regenerate it come with their own ADR in M3.
6. **Supersedes two lines of ADR 0002:** the addendum "Empty magazine" (melee fallback) and "Magic classes at M2" (basic attack costs no mana). The rest of ADR 0002, including "one resource per class", stays.

## Consequences

- The engine's magazine mechanism is reused: magic classes get a magazine of capacity 3, and the reason of refusal depends on the resource kind.
- Melee attacks of the Sniper (pistol) spend ammunition. The characters prototype already shows this.
- The bot's damage estimate loses the melee branch: an attack is worth the unit's own attack at every distance. The bot's reload score applies to mana too (EA-10).
- The player-facing name of the pool is **energy** ("sem energia, medite"), while the mechanism keeps
  the name mana: the refusal code `no-mana`, the `mana` kind and this ADR all say mana. The owner's
  decision of 2026-10-06: the word on the screen is the fiction's, the word in the code is the
  mechanism's, and the Sniper's pool stays ammunition in both.
- DT-57 (mana is not in the engine) is closed for the M2 scope. Mana regeneration stays in M3.
- Playtest balance is re-checked with EA-11 after this lands.
