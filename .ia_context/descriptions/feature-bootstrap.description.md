# MR — Rename, English translation, ADRs, CLAUDE.md and CI

**Branch:** `feature/bootstrap`
**Base branch:** `develop`
**Milestone:** —
**Ticket(s):** —
**Date:** 2026-10-03

---

### 1. What this MR delivers

It puts the repository in the shape the next milestones will follow. It renames the project from `mystic-alley` to `eldritch-alley` across packages, the Worker, Compose, the local database and images, and regenerates the lockfile. It translates code comments, `pitch.md`, `README.md` and the roadmap into English. The roadmap now has milestones M0 to M6, with a minimal engine in M1 and the rules and content in M3. Six ADRs in `docs/adr/` record the decisions already made. It also adds `CLAUDE.md` with the working rules, an MIT license, and a CI workflow that runs typecheck, tests and build.

Consequence for the team: from this MR on, any design decision that changes the state model needs an ADR, and `CLAUDE.md` defines the precedence between ADRs, rules and plans. No game rule is implemented yet.

There is no approved plan for this MR. Its scope is the repository reorganization that was approved before execution. The M0 CI item will be marked done only after the workflow runs green on GitHub.

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `package.json`, `package-lock.json` | Scope `@eldritch-alley/*` and project name | Imports and scripts depend on the new scope; the lockfile was regenerated with it |
| `backend/game-server/src/main.ts` | Imports `@eldritch-alley/engine` | The only code reference to the engine package |
| `docker-compose.yml`, `.env.example` | Project name, images and `eldritch` database | Local environment is new: the old Postgres volume is not reused |
| `frontend/wrangler.jsonc` | Worker name | Not deployed yet, so no public URL changes |
| `backend/*/src`, `frontend/src`, `frontend/index.html` | Comments and labels in English; HTML `lang` set to `en` | Follows the rule that everything in the repository is in English |
| `docs/adr/0001` to `0006` | Decisions: individual initiative, one resource per class, permanent death, PvP turn timer (proposed), integer math in the engine, NestJS 11 | Decisions that define the state model and cannot be reopened without a new ADR |
| `ROADMAP.md` | Roadmap rewritten with M0 to M6 | The comparison point with the other game sits at the end of M2 |
| `CLAUDE.md` | Overview, structure, six rules and precedence | Guides any AI-assisted work in the repository |
| `LICENSE` | MIT, holder Heron Oliveira Amaral, 2026 | Public license for the project |
| `.ia_context/README.md` | Folder renamed and documented | AI planning artifacts are versioned on purpose |
| `.ia_context/descriptions/` | Description and pre-review for this branch | Versioned review artifacts, one pair per branch |
| `.github/workflows/ci.yml` | Typecheck, tests and build | Runs on pull requests and on pushes to `develop` and `main` |

### 4. Notes for the reviewer

- Local validation passed: `npm run typecheck`, `npm test` and `npm run build`. The typecheck failed earlier because of stale `dist/` and `tsbuildinfo` artifacts, which are git-ignored. They were removed and rebuilt. In a clean clone this does not happen.
- The CI workflow has not run on GitHub yet. The first run is the real verification of the workflow.
- `npm audit` reports 18 vulnerabilities, 4 of them high. This MR does not change those dependencies. Most sit in the Colyseus 0.16 line, whose fix requires a migration to 0.18. That will be handled in a separate MR, with its own ADR.
- The M2 section of the roadmap records the Cloudflare Tunnel WebSocket test, run on 2026-10-03. Without traffic, the connection was closed after ~125 s (close code 1006). With a ping every 25 s, it stayed open for the full 10-minute test and ended by timeout, not by a drop. Two items remain open and are part of the M2 acceptance test, not this MR: the reconnection test after a forced drop, and confirmation that the 3 s server ping keeps an idle turn alive through the tunnel for more than 2 minutes.
- `CLAUDE.md`, `ROADMAP.md` and `pitch.md` have changes that are not committed yet. They must be on the branch before the PR is opened.
