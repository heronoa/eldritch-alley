# Eldritch Alley: Tactics

> Provisional title. Concept for an MVP of a turn-based tactical RPG for the browser.

## Pitch

Squads of soldiers, initiates and adepts fight for the city, block by block. Each match is a turn-based tactical battle on an urban map with height: rooftops, fire escapes, alleys, overpasses. The player builds a team from weapon and magic classes and faces a bot or another player.

## Pillars

1. **Height is tactics.** Climbing a building changes range, line of sight and damage. The map is not scenery: it is the decision.
2. **Weapons and magic play differently.** Weapon classes depend on ammunition, cover and line of sight. Magic classes depend on mana, area and positioning.
3. **Every match is verifiable.** The server decides everything, and any match can be reviewed action by action.

## Setting

A contemporary city where magic is real and contested. It may share the universe of the Magia Urbana project (a secret society of hunters, with magic as part of reality), as a parallel game in that world. This is an open decision.

## Loop

1. Build a squad (in the MVP, three units chosen from the available classes).
2. Join the queue: against a bot or in ranked PvP.
3. Play the match until one squad is eliminated.
4. Earn class experience and a rating change (outside the MVP: unlock advanced classes).

## Combat

- **Grid with height:** each cell has a level (ground, first floor, rooftop...). Climbing costs movement; each class has a limit on how many levels it can climb per step.
- **Initiative turns:** order is set by each unit's speed, in a queue visible to both sides. On its turn, a unit can move and act, in any order.
- **Direction matters:** attacking from behind or from the flank gives a bonus to hit and to damage.
- **Line of sight and cover:** weapons need line of sight; walls, cars and crates give cover and reduce the chance to hit. Area magic ignores cover but requires positioning.
- **Resources:**
  - Weapon classes: ammunition, with a reload action.
  - Magic classes: mana, which regenerates a little each turn.
- **Height advantage:** a unit attacking from above gains range and accuracy; a unit attacking from below loses them.

## Classes

### Progression

Every unit starts in a base class and, on reaching a level in it, unlocks the advanced classes of its line.

| Line | Base class | Advanced |
|---|---|---|
| Weapons | **Soldier** | Sniper, Assaulter |
| Arcane | **Initiated** | Wizard, Warlock |
| Faith | **Adept** | Priest, Paladin |

### Advanced classes

| Class | Role | Identity |
|---|---|---|
| **Sniper** | Long-range damage | Stays high, sees far, kills with one well-placed shot. Fragile up close |
| **Assaulter** | Tank and short- and mid-range damage | Advances, holds the line, takes damage and punishes anyone who gets close |
| **Wizard** | Control and area damage | Changes the field: blocks paths, pushes units, punishes grouped enemies |
| **Warlock** | Burst damage | Concentrates heavy damage on one target in one turn, at a high cost in mana or life |
| **Priest** | Healing and group control | Keeps the team alive and locks enemies down with stun or silence |
| **Paladin** | Healing and tank | Front-line fighter who sustains itself and protects nearby allies |

### Ability ideas (starting point for balancing)

- **Soldier:** Shot, Reload, Smoke grenade (blocks line of sight).
- **Sniper:** Precise shot (more range the higher it stands), Watch (fires at anyone who enters its field of view on the enemy turn), Piercing shot.
- **Assaulter:** Burst (short cone), Charge (moves and attacks), Taunt (nearby enemies must target it).
- **Initiated:** Spark, Simple arcane shield.
- **Wizard:** Fireball (area), Wall (creates temporary cover), Push (displaces a unit; a fall in height causes damage).
- **Warlock:** Drain (damage that heals the Warlock), Curse (damage over time), Rupture (very high damage, costs life).
- **Adept:** Simple heal, Blessing (defense bonus).
- **Priest:** Area heal, Silence (prevents magic), Resurrect.
- **Paladin:** Holy strike, Aura (adjacent allies take less damage), Laying on of hands.

## Maps

Urban, compact and vertical: a rooftop with water towers, an alley with fire escapes, a metro station with platforms, an overpass above an avenue. Each map has contested high points, cover, and at least two routes between the sides.

## MVP

The goal of the MVP is a complete, playable match, with the backend doing the heavy work.

- **One map**, 8 by 8, with three height levels.
- **Three playable classes,** one per line, to cover the three styles. Suggestion: Sniper (shows height and line of sight), Wizard (area and control) and Priest (healing).
- **Three-unit teams,** with no progression and no roster management.
- **Against the bot first,** then PvP with matchmaking.
- **Isometric 2D visuals** (Phaser), no 3D.

## What the backend demonstrates

- **Deterministic battle engine** in pure TypeScript: with the same seed and the same actions, the result is always the same.
- **Authoritative server:** the client asks to "move to this cell" and "use this ability on this target"; the server checks range, height, line of sight, resources and turn, and only then applies it.
- **Match as a sequence of events:** every accepted action is stored as an event. Reconnecting, watching a replay and auditing a match are the same thing: running the events again.
- **Classes and abilities as data:** a new class is configuration, not new code in the engine.
- **Bot on the server,** with a simple utility heuristic (attack the weakest target in range, seek height, retreat when health is low).
- **Rating-based matchmaking** with a queue in Redis, and asynchronous rating updates after the match.
- **WebSockets** for match state, with PostgreSQL for players, matches and events.

## Recommended stack

**Principle:** the battle engine stays in pure TypeScript, deterministic and free of framework dependencies. Colyseus and NestJS are layers around it; either one can be replaced without rewriting the rules.

| Layer | Technology | Why |
|---|---|---|
| Battle engine | Pure TypeScript (shared package) | Rules, height, line of sight and initiative are testable without a server; a seeded random source makes every match reproducible |
| Match server | Colyseus | Rooms, state sync sending only the differences, reconnection mid-match and spectators; this is where a game with long matches and large state gains the most from a dedicated framework |
| Platform | NestJS | Accounts, rosters, rating, history and replays; it is the stack of the target role and organizes everything outside the match itself well |
| Room authentication | JWT issued by NestJS, validated by Colyseus when joining a room | A single login for both services |
| Service integration | Queue (SQS with LocalStack, or BullMQ) | The room publishes "match ended" with the match events; NestJS consumes it, stores the replay and updates the rating |
| Database | PostgreSQL with MikroORM | Players, rosters, matches and each match's events; MikroORM is the ORM named in the target role |
| Redis | Presence and Colyseus driver, matchmaking queue | Allows running several match-server instances and matching by rating |
| Client | Phaser and the Colyseus client | Isometric 2D with an engine the author already knows |
| Local environment | Docker Compose (PostgreSQL, Redis, LocalStack) | Both services and their dependencies with one command |

**Suggested structure**

```
engine/        deterministic battle engine (pure TypeScript)
game-server/   Colyseus: rooms, sync, bot
platform-api/  NestJS: accounts, rosters, rating, replays, matchmaking
frontend/      Phaser + Colyseus client
```

Two services that talk through a queue also tell a microservices story, which the target role asks for.

## Out of the MVP

Class progression and unlocking advanced classes, roster management, a secondary ability from another class, a PvE campaign, more maps, equipment, 3D visuals.

## Post-MVP: progression

Direction only. Nothing in this section enters the MVP (milestones M0 to M6 in the roadmap). It records design decided in conversation, to be detailed when the progression and economy milestones are planned.

### Characters and classes

- Every character starts in one of three base classes: Soldier, Initiated or Adept.
- Characters earn class points per class in battle and spend them to buy that class's abilities. The name of these points is not decided yet; "Mastery" is the current candidate.
- Build: one primary class with its full ability set, plus one secondary set taken from another class the character has practiced, limited to the abilities bought in that class.

### Attributes: Nerve and Attunement

- **Nerve** is the character's alignment with the physical world. **Attunement** is the alignment with the spiritual and esoteric world.
- The two are independent attributes, each from 0 to 100, with a cap on their sum (tentative value: 120). Nobody maxes both.
- Lore reading: the difference between them is the character's alignment (physical or esoteric); the sum is how intensely present the character is in both worlds.
- Both are double-edged:

| Attribute | Increases | Costs |
|---|---|---|
| Nerve | Weapon accuracy and critical chance, reaction chance (counter, overwatch), resistance to fear and stun | Esoteric effects received are weaker, both enemy spells and ally heals |
| Attunement | Power of spells and heals the character casts | Esoteric effects received are stronger, both enemy spells and ally heals |

- Four profiles, each meant to have a distinct role:

| Profile | Nerve | Attunement | Plays as |
|---|---|---|---|
| Anchored | High | Low | Precise weapons and strong reactions; nearly immune to magic, but barely healed |
| Medium | Low | High | Powerful spells and heals; takes heavy damage from enemy magic |
| Volatile | Mid-high | Mid-high | Good with weapons and magic, vulnerable to everything |
| Stoic | Low | Low | Average offense, resists almost every effect, good or bad; holds positions |

- Formula structure: the strength of an esoteric effect depends on the caster's Attunement and the target's Attunement, in integer math (ADR 0005). Exact numbers come from balancing.
- Validation rule: the system has two real dimensions only if at least three of the four profiles are good choices in different situations. If playtests converge on one profile, rebalance the costs. Use the bot to simulate matches between teams of different profiles.
- In the MVP, each class uses fixed attribute values; players do not change them.

### Permanent death and equipment

- A character who dies in battle is lost for good, together with their equipment.
- On death, one piece of the character's equipment drops on the map as an unknown item. Either team can pick it up, and its identity is only revealed to the player who picks it up.
- **Technical requirement:** the item's identity must never be sent to clients before pickup. The server filters state per client; check the filtering features of Colyseus 0.16 when this is built.

### Economy

- No real money. New characters are bought with in-game currency earned in every match: more for the winner, some for the loser.
- Anti-farming measures, to design when the economy exists: lower rewards against the bot, a daily cap on rewarded matches, no reward for matches that end too quickly.

### Equipment and build

**Equipment slots (6):** armor, helmet, main hand, off hand, and two accessories.

**Hand rules.** Proposed default, to be confirmed in balancing:

| Setup | Without proficiency | With proficiency |
|---|---|---|
| One large weapon | Uses both hands | Uses one hand |
| Large weapon + off hand | Not allowed | Up to two large weapons |
| Small weapon + off hand | Shield or another small weapon | Shield, small or large weapon |

The proficiency that allows two large weapons is a support ability. Which class teaches it is not decided yet.

Open questions for weapons that use ammunition when dual wielding:
- Does each weapon have its own ammunition?
- Does an attack with both weapons spend ammunition from both?
- Does reloading reload both at once?

**Ability types.** Each class provides four kinds of abilities:
- an **active** ability set (its spells or techniques);
- a **reaction** ability (triggers on its own, such as counter or overwatch);
- a **movement** ability;
- a **support** ability (passive). "Support" is the single name for passive abilities; "passive" is not a separate category.

**Character build.** A character equips:
- two active ability sets (for example, all bought Wizard spells and all bought Soldier techniques);
- one reaction ability, from any class the character has had;
- one movement ability, from any class the character has had;
- one support ability, from any class the character has had.

Only abilities the character has bought can be equipped.

**MVP.** Each class uses a fixed loadout: fixed equipment and fixed abilities. Players do not change equipment or abilities in the MVP.

### Reactions

Reactions are abilities that trigger during another unit's action, not during the unit's own turn. A counterspell interrupts an enemy spell and deals damage to the caster; a counter-attack strikes back when a unit takes a blow. Each reaction spends a reaction slot.

- **Slots** depend on Nerve, with a minimum of 3 (see [ADR 0007](docs/adr/0007-reaction-abilities.md) for the bands).
- **Slots refresh** at the start of the unit's own turn.
- **Cost:** every reaction costs one slot for now. Later skills may spend more or fewer.
- **Interruption:** a reactable event pauses the match in a reaction window; the target player accepts or declines before the action resolves.

### Bodies and resurrection

A defeated unit becomes a body on its tile. The body blocks the tile and cannot be targeted, for a number of rounds that depends on Nerve: 3 rounds (Nerve 0–49), 4 (50–99) or 5 (100). When that time is up, the body disappears, an item appears in its place, and the character is permanently dead. The death is recorded, not deleted. If the match ends first, or the unit is revived, it returns to its team as usual (see [ADR 0003](docs/adr/0003-permanent-death.md)).

Resurrection has two steps: first the caster selects the defeated character, then selects an empty, unoccupied tile in range to place it on.

## Open questions

- Shared universe with Magia Urbana, or its own? *Still open.*
- Ammunition and mana as separate resources, or one resource per class? *Resolved: one resource per class, see [ADR 0002](docs/adr/0002-one-resource-per-class.md).*
- Initiative per unit (each unit takes its own turn) or per team (the whole team acts and then passes)? *Resolved: per unit, see [ADR 0001](docs/adr/0001-individual-initiative.md).*
- Turn timer in PvP matches? How long? *Proposed: 30 seconds, to be revised after playtest, see [ADR 0004](docs/adr/0004-pvp-turn-timer.md).*
- Permanent death of a unit within a match, or a countdown to return? *Resolved: permanent, see [ADR 0003](docs/adr/0003-permanent-death.md).*
