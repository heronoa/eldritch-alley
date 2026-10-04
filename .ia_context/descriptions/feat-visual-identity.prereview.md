# Pre-review — Visual identity, isometric board with overlay HUD, and the first debt quick wins

**Branch:** `feat/visual-identity`
**Generated on:** 2026-10-04

---

### 1. What to test

Automated first. These are the proxies for what has no browser.

- **Use Node 22 first** (`nvm use` reads `.nvmrc`). The server tests stop with a clear message on Node 18.
- **Frontend suite, typecheck and build:** `npm test -w @eldritch-alley/frontend` (expect 203 passing, 0 failing),
  `npx tsc --noEmit` inside `frontend/`, and `npm run build -w @eldritch-alley/frontend`.
- **Engine suite:** `npm test -w @eldritch-alley/engine` (expect 122 passing). The property test now has a 30 s timeout.
- **Server typecheck:** `npx tsc --noEmit` inside `backend/game-server/` (expect no errors).
- **Server suite:** `npm test -w @eldritch-alley/game-server` expects 18 passing across 4 files, including the
  `malformed-action` case and the shape tests. Or run the root `npm test` for all four workspaces.

Manual, in a browser at 1280×720, with the game server running (`npm run dev -w @eldritch-alley/game-server` and
the frontend dev server):

- **Match start, looks:** open the lobby, press "Jogar contra o bot". The title is in Special Elite, the body in
  IBM Plex Mono, the board is three blocks of height, and the panels float over it. Empty state: no move is armed
  and "Atacar" is disabled until an enemy is in reach. Error state: stop the server and press play; the lobby shows
  "Servidor indisponível" and the button works again after restart.
- **Units and animation:** each unit is a pixel sprite facing the other team. Move a unit one cell: it walks. Attack
  an adjacent enemy: the melee frames play and the target flashes on a hit. Attack from two or more cells away: the
  ranged frames play and a tracer or missile crosses the board.
- **Effects over blocks (DT-44):** attack a target standing behind a raised block. The effect is drawn over the block.
- **Turn queue (DT-52):** each chip in the queue shows the unit's sprite in its team colour, and the acting unit has
  the ring. A fallen unit is grey.
- **Removed bodies (DT-24):** after a body is removed, the tile is free: a unit can move onto it and no ghost is drawn.
- **Clicks on the HUD:** click each of the four action buttons where they are drawn; each responds. Click the
  unit panel and the log; nothing moves on the board.
- **The way out (DT-59):** finish a match, win or lose. The "Voltar ao início" button appears under the result.
  Press it: the lobby opens. Press play again: a new match starts, and one click produces one action.
- **Leave without a drop (DT-59):** after the way out, check the server log: the room is left, and no reconnection
  notice appears.
- **Known defect, expected to fail (DT-60):** reload the page in the middle of a match and press play in the lobby.
  The lobby shows "Servidor indisponível" instead of returning to the battle. This is the known defect; the
  reviewer should not count it against the visuals.

---

### 2. Code checklist

- [ ] No `console.log` or debug output in the new files (`frontend/src/scenes/*.ts`, `frontend/src/view/*.ts`,
      `frontend/src/net/session.ts`, `backend/game-server/src/action-shape.ts`)
- [ ] No `any` without a reason in `action-shape.ts`, `battle-room.ts` and `session.ts`
- [ ] The engine's `RejectReason` is unchanged (`git diff develop -- backend/engine/src/types.ts` is empty)
- [ ] `malformed-action` is mapped in `frontend/src/game/log.ts` and in both protocol copies
- [ ] The tests of §1 cover the new modules (`action-shape`, `iso`, `unit-look`, `presentation`, `session`, `selection`)
- [ ] `technical-debt.md` and `technical-debt-closed.md` agree with each other on DT-44, DT-59, DT-24, DT-52, DT-20, DT-32; DT-31 stays open until its loaded-machine check
- [ ] Decide the branch split before the merge (see the description, §4): the identity work and the title-screen
      plans, the licence files and the debt reorganisation are different subjects

---

### 3. Behaviour checklist

**Look and board**

- [ ] The three height levels read as blocks, with darker left and right faces
- [ ] The overlay panels are over the board, and the board stays visible behind them
- [ ] The legend reads "Azul-tinta: você · Vermelho: bot · Papel: selecionado"

**Match flow**

- [ ] A move armed with "Mover" shows its cells as diamonds; an attack armed with "Atacar" shows its targets
- [ ] An attack after a full movement works when an enemy is in reach, and "Atacar" is disabled when none is
- [ ] A refused action shows a Portuguese sentence in the log, not a raw code

**Finish and leave**

- [ ] The result text ("Vitória" or "Derrota") is inside the stamp frame
- [ ] "Voltar ao início" returns to the lobby, and the lobby's button starts a new match
- [ ] A second match after leaving does not show the first match's board or log
