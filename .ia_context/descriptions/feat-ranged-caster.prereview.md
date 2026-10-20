# Pre-review — Ranged basic attack for the magic classes, one pool per class, and the two resource refusals

**Branch:** `feat/ranged-caster`
**Generated on:** 2026-10-06

---

### 1. What to test

Run `npm run dev:game-server` and `npm run dev:frontend` from the root and play against the bot. Initiative
is by speed, so the opening turns of a match are the human's Sniper, the bot's Sniper, then the human's
**Wizard**, then the bot's Wizard — `Terminar turno` walks you to each one. Organised from most to least
critical.

**1. The Wizard's strike at range, which is the point of the ticket.** On the Wizard's turn, press `Atacar`.
Expected: the red highlight covers cells up to **3** away, not just the ring of neighbours. Click an enemy 2
or 3 cells away: the attack happens, damage is the class's own 3 (never halved), and one **cyan** pip above
the Wizard goes out. Repeat from 3 cells with a building between you and the target: expected "Sem linha de
visão", the EA-1 rule still holding for magic. Watch the target's HP: a hit must take 3, at every distance.

**2. The Priest reaches 2 and not 3.** Get to the Priest's turn and press `Atacar`: the highlight must stop
at 2 cells, one ring short of the Wizard's. Click an enemy at 3 cells: expected "Alvo fora de alcance" in the
log, nothing sent, no pip spent. Then close to 2: accepted, 2 damage, one cyan pip out.

**3. The empty pool, refused before anything else — the behaviour most likely to read as a bug.** Empty the
Wizard's pool (three strikes, or one match is enough) and press `Atacar`:
- on an enemy **adjacent**: expected "Sem energia, medite", no damage, no pip change;
- on an enemy **4 cells away**: expected "Sem energia, medite" and **not** "Alvo fora de alcance";
- on an enemy **behind a building**: expected "Sem energia, medite" and **not** "Sem linha de visão".

The pool is answered first on purpose (ADR 0011): a strike nobody can pay for is refused the same way at
every distance. If the order surprises you, this is the item to raise — it is a deliberate change, mirrored
in the client so the sentence you read is the one the server would have sent.

**4. Meditation.** With the pool empty, press `Recarregar`: expected three cyan pips lit at once, the log
line **"Wizard meditou"** (not "recarregou"), the action spent and the movement untouched — you can still
walk after meditating. Press `Recarregar` again in the same turn: "Ação já usada". With a full pool: "Carregador
cheio". On the Sniper's turn the same button must still say **"Sniper recarregou"** and light **warm** pips.

**5. The Sniper lost its half-damage melee blow.** Empty the Sniper's magazine by shooting three times, then
stand it adjacent to an enemy and press `Atacar`. Before this MR that was an adjacent blow at half damage
(2 instead of 4) and it was accepted; now it must be **refused with "Sem munição, recarregue"**, with no
damage dealt. With ammunition and an adjacent target it must still deal the full 4 — that part is unchanged,
and it is the regression to confirm you did not break it while removing the fallback.

**6. The three places the word appears, and they must agree.** Select the Wizard and check: the dashboard
cell at the bottom right reads `Energia 3/3`; the panel row reads `Energia`. Long press the Wizard (or right
click) and check the sheet's resource row: it must also read `Energia`, and the sheet must still be four rows.
Then do all three for the Sniper: `Munição`, and the pips warm. A unit must never show a word that belongs to
the other kind.

**7. The bot now meditates instead of standing still.** Let a match run until the bot's Wizard empties its
pool. Expected: it spends a turn on `reload` (score 15 in the heuristic) rather than ending its turn with a
strike it cannot pay for. It must never be refused repeatedly, and the match must still reach `ended` — the
integration test asserts the replay, but only a played match shows the behaviour.

**8. Error, empty and mismatch states.**
- **A unit that carries no pool at all** (`magazine === null`) is a path only an old setup reaches: no roster
  class has one any more, so you will not find it in a match. It is covered by the engine tests alone — say so
  rather than hunting for it in the browser.
- **Version mismatch.** With a tab open from before this bump, restart the game server: the tab must show
  "Versão incompatível" and stop there, rather than drawing a board whose pip row is built from a field that
  no longer exists.
- **A fresh match with the log empty**: closed box, header, no line.
- **A refused strike** must never leave the board changed: compare the enemy's HP and the pip row before and
  after the three refusals of item 3.

**9. Replay and determinism, without a browser.** `npm test -w @eldritch-alley/engine` (the hash case in
`mana.test.ts` and the property test) and `npm test -w @eldritch-alley/game-server` (the full match that
replays its events to the last state) are the evidence that a v6 `attacked` event spends exactly what the
live match spent. Read them rather than replaying by hand.

---

### 2. Code checklist

- [ ] Every `UnitState` fixture carries `resourceKind`; `npx tsc -p frontend/tsconfig.json --noEmit` and
      `npm run typecheck` are what enforce it, and both are clean.
- [ ] No leftover of the old names anywhere: `grep -rn "ammoSpent\|DASHBOARD_AMMO_RECT\|panel.label.mana"`
      must return nothing but the protocol changelog comments.
- [ ] The engine's `resourceRefusal` (`backend/engine/src/actions.ts`) and the client's
      (`frontend/src/game/selection.ts`) answer the **same reason in the same order**: pool, then reach,
      then sight. A drift between the two is the bug EA-1 D1 exists to prevent.
- [ ] `applyEvent` spends a round when `event.resource !== null`, reading the event rather than re-deriving
      the unit's kind — that is what makes the replay land on the same state.
- [ ] `newMatch` still defaults a setup that omits `resourceKind` to ammunition, and a class with no magazine
      to no kind at all.
- [ ] Both catalogs carry `log.event.meditated`, `log.rejection.no-ammunition`, `log.rejection.no-mana` and
      `panel.label.energy`, and `panel.label.mana` is gone from both.
- [ ] The code/word asymmetry is the intended one: the kind and the refusal code say `mana`, the copy says
      energy, and the Sniper says ammunition in both.
- [ ] `PanelKey.mana` → `energy` has no stale references, and `HudScene`'s dashboard cell reads the row by
      the two keys it can have.
- [ ] No `any` added without a justification, and no `console.log` or debug code in the diff.
- [ ] `npm test -w @eldritch-alley/engine` 216/216 with no pending cases; `npm test -w
      @eldritch-alley/game-server` 63/63; `npm test -w @eldritch-alley/frontend` 650/650.
- [ ] `npm run typecheck`, `npx tsc -p frontend/tsconfig.json --noEmit` and
      `npm run build -w @eldritch-alley/frontend` all pass.
- [ ] **The debt bank matches the code:** DT-80 and DT-57 move to the closed list with their resolution (the
      refusal reason closes the first; the cyan pips and the kind close the second). Today the diff does not
      touch `.ia_context/` at all, so this is still to do.
- [ ] **`docs/adr/README.md` lists 0010 and 0011 with their status.** The table stops at 0009, so the ADR this
      MR accepts is not in the one index a reader checks.
- [ ] Nothing in the diff is outside the plan other than the four divergences the description names: the
      energy wording, the two files the panel change reached, the missing meditation animation, and the two
      tests that stopped being `it.todo`.

---

### 3. Behaviour checklist

- [ ] The Wizard strikes at 3 and the Priest at 2, both at full damage at every distance.
- [ ] A strike spends one pip of the caster's own kind, and the pip row is cyan for mana, warm for a magazine.
- [ ] An empty pool is refused with "Sem munição, recarregue" / "Sem energia, medite" at every distance,
      ahead of the reach and the line of sight.
- [ ] Meditating refills to full, spends the action, keeps the movement, and logs "meditou".
- [ ] Reloading a magazine still logs "recarregou" and lights warm pips.
- [ ] The Sniper no longer makes a half-damage blow with an empty magazine, and still deals full damage with
      ammunition.
- [ ] The dashboard, the panel and the inspection sheet name the pool the same way for the same unit.
- [ ] The bot meditates when its pool runs out, and a match still reaches `ended`.
- [ ] A stale tab shows "Versão incompatível" instead of a board built from the old event shape.
- [ ] A refused strike changes nothing: same HP, same pip row, log line only.
