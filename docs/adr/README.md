# Architecture Decision Records

Short records of decisions that shape the game and the codebase. Each ADR has a context and a decision. Accepted ADRs are not rewritten: a changed decision gets a new ADR that supersedes the old one.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-individual-initiative.md) | Individual initiative | Accepted |
| [0002](0002-one-resource-per-class.md) | One resource per class | Accepted |
| [0003](0003-permanent-death.md) | Permanent death within a match | Accepted |
| [0004](0004-pvp-turn-timer.md) | PvP turn timer (30 s) | Accepted |
| [0005](0005-deterministic-integer-engine.md) | Deterministic engine with integer math | Accepted |
| [0006](0006-nestjs-11.md) | NestJS 11 instead of 12 | Accepted |
| [0007](0007-reaction-abilities.md) | Reaction abilities and reaction slots | Accepted |
| [0008](0008-colyseus-0.18.md) | Colyseus 0.18 for the match server | Accepted |
| [0009](0009-client-localization.md) | Client-side localization without a library | Accepted |
| [0010](0010-movement-by-destination-and-turn-scoped-commands.md) | Movement by destination and turn-scoped commands | Accepted |
| [0011](0011-mana-as-magic-class-resource.md) | Mana as the magic classes' resource | Accepted |
| [0012](0012-cover-and-typed-props.md) | Cover and typed props on the board | Accepted |
| [0013](0013-no-cover-under-the-feet.md) | A prop under the feet gives no cover | Accepted |
| [0014](0014-facing-and-direction-bonus.md) | Facing and the direction bonus | Accepted |
| [0015](0015-height-advantage.md) | Height advantage | Accepted |
| [0016](0016-abilities-as-data.md) | Abilities as data | Accepted |
| [0017](0017-mana-regeneration.md) | Mana regenerates one point at the start of the turn | Accepted |
| [0018](0018-oauth-sign-in-session-and-ticket.md) | Sign-in with GitHub and Google, a stateless session and a game ticket | Accepted |
| [0019](0019-migrations-as-a-single-step.md) | Migrations run as a single step, before the services start | Accepted |
| [0020](0020-persistent-squad-and-starter-set.md) | A persistent squad with a starter set | Accepted |
| [0021](0021-password-sign-in-with-a-verified-address.md) | Entering with an address and a password, once the address is verified | Accepted (supersedes 0018 § 1) |
| [0022](0022-sso-through-keycloak.md) | Optional SSO through Keycloak, and self-service account deletion | Accepted (supersedes 0018 § 1) |
| [0023](0023-statuses-terrain-and-resurrection.md) | Statuses, difficult terrain and resurrection | Accepted (amends 0016 §2 and §6) |
