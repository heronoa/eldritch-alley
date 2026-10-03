# Index — M2-a: playable match against the bot, local

**Created on:** 2026-10-03
**Source:** [match-server-m2.plan.md](match-server-m2.plan.md) (superseded by this index), [ROADMAP.md](../../ROADMAP.md) M2-a

Order of execution: server first, then frontend logic, then integration, then design. Each plan has an acceptance list and can be reviewed alone. Frontend logic does not need the server to run; integration does.

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [m2a-server.plan.md](m2a-server.plan.md): Colyseus 0.18, room, session, bot, reconnection | [ ] pendente | — |
| 2 | [m2a-logic.plan.md](m2a-logic.plan.md): grid functions, protocol, net client, selection, log (no browser) | [ ] pendente | — |
| 3 | [m2a-integration.plan.md](m2a-integration.plan.md): scenes, full match against the bot, reconnection in the browser | [ ] pendente | — |
| 4 | [m2a-design.plan.md](m2a-design.plan.md): colours, labels and layout only | [ ] pendente | — |

## Dependency notes

- The server plan changes no engine code. The bot uses only the public contract (`applyAction`, `publicState`, `newMatch`).
- Frontend logic depends on the message protocol written in the server plan (`m2a-server` step 6). It may be developed against the protocol file alone.
- Integration depends on server and logic approved.
- Design depends on integration approved.
