# Pre-review — Rename, English translation, ADRs, CLAUDE.md and CI

**Branch:** `feature/bootstrap`
**Generated on:** 2026-10-03

---

### 1. What to test

- **Full install and verification on a clean clone:** `npm ci`, `npm run typecheck`, `npm test` and `npm run build` must all pass. This is the most important check, because the typecheck failed locally because of stale build artifacts.
- **Local environment:** `cp .env.example .env`, `npm run infra:up` and `npm run dev:platform-api`. `http://localhost:3000/health` must return `{"status":"ok"}`. The database is now `eldritch_alley`, so the old `mystic_alley` volume is not used.
- **Game server:** `npm run dev:game-server` must print the startup message with the engine version. No `@mystic-alley` import may remain.
- **Full Compose stack:** `docker compose up --build` must start Postgres, Redis, LocalStack, platform-api and game-server with the `eldritch-alley/*` images.
- **CI workflow:** after the PR is opened, the `check` job must go green. If it fails, the log of the step that broke points to the problem.

---

### 2. Code checklist

- [ ] No `mystic` occurrence outside `package-lock.json` (`git grep -i mystic`)
- [ ] No Portuguese comments or labels in the code
- [ ] `package-lock.json` was regenerated with the new package names, without swapped dependencies
- [ ] All six ADRs (0001 to 0006) appear in the `docs/adr/README.md` index, and ADR 0004 shows status `Proposed`
- [ ] `LICENSE` has the correct holder and year
- [ ] `.ia_context/` contains the `README.md` and the `descriptions/` pair for this branch, both in English
- [ ] `CLAUDE.md`, `ROADMAP.md` and `pitch.md` are committed on this branch

---

### 3. Behavior checklist

- [ ] The README opens on GitHub and the links to `pitch.md`, `ROADMAP.md`, `docs/adr/` and `LICENSE` work
- [ ] The Mermaid diagram in `ROADMAP.md` renders as a graph on GitHub
- [ ] The "Open questions" links in `pitch.md` point to ADRs 0001, 0002, 0003 and 0004
- [ ] The Git section of `CLAUDE.md` is present
