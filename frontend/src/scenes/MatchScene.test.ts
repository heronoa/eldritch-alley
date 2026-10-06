// The match scene's wiring (DT-41): what the scene does with the server's messages and the player's
// presses. Phaser is a stand-in here (see `testing/phaser-stub.ts`), so these tests read what the
// scene decides and hands the HUD; the drawing is still checked by hand in a browser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  type Board,
  type PublicState,
  type RejectReason,
  type StateMessage,
  type Team,
  type UnitId,
  type UnitState,
} from '../protocol';
import type { Session } from '../net/session';
import { setLocale } from '../i18n/translate';
import { INSPECT_CLOSE_RECT, INSPECT_RECT, LOG_RECT, LOG_TOGGLE_RECT } from '../view/layout';
import { MatchScene } from './MatchScene';

vi.mock('phaser', async () => ({ default: (await import('./testing/phaser-stub')).stub() }));
// The map is painted on canvases the Node run does not have: the scene's wiring does not depend on it.
// `setCovered` is the call that would paint the building the view cuts down (EA-12, slice 4): here it
// only has to exist, because the canvas is not there to be set translucent.
vi.mock('./map/MapView', () => ({
  MapView: class {
    destroy() {}
    update() {}
    setCovered(_cells: readonly { x: number; y: number }[]) {}
  },
}));

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

function makeUnit(id: UnitId, team: Team, x: number, y: number): UnitState {
  return {
    id,
    team,
    position: { x, y },
    speed: 10,
    health: 12,
    maxHealth: 12,
    attack: 4,
    hitChance: 80,
    range: 3,
    magazine: 3,
    movement: 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    defeated: false,
    ammo: 3,
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

/** A match on the human's turn, or the bot's, with the unit on turn having nothing left (`spent`). */
function stateFor(options: { onTurn: Team; spent: boolean }): PublicState {
  return {
    seed: 1,
    board: BOARD,
    units: [makeUnit('A-sniper', 'A', 0, 0), makeUnit('B-priest', 'B', 7, 7)],
    initiative: ['A-sniper', 'B-priest'],
    currentIndex: options.onTurn === 'A' ? 0 : 1,
    movementLeft: options.spent ? 0 : 3,
    round: 4,
    hasActed: options.spent,
    eventCount: 0,
    pendingMove: null,
  };
}

interface FakeSession extends Session {
  send: ReturnType<typeof vi.fn>;
  emit: {
    state(message: StateMessage): void;
    rejected(reason: string): void;
    ended(winner: Team): void;
  };
}

/** The session the scene talks to: it records what the scene sends and lets a test play the server. */
function fakeSession(): FakeSession {
  const handlers: Record<string, (value: never) => void> = {};
  const on = (name: string) => (handler: (value: never) => void) => {
    handlers[name] = handler;
    return () => {};
  };

  return {
    send: vi.fn(),
    onState: on('state'),
    onEvents: on('events'),
    onRejected: on('rejected'),
    onEnded: on('ended'),
    onDrop: () => () => {},
    emit: {
      state: (message: StateMessage) => handlers.state(message as never),
      rejected: (reason: RejectReason) => handlers.rejected({ reason } as never),
      ended: (winner: Team) => handlers.ended({ winner } as never),
    },
  } as unknown as FakeSession;
}

/** A scene that has been created with the session, and a HUD that records what it is handed. */
function startMatch() {
  const session = fakeSession();
  const scene = new MatchScene();
  scene.init({ session });
  scene.create();

  const render = vi.fn();
  (scene as unknown as { hud: unknown }).hud = { render };
  return { scene, session, render };
}

/** The last view the HUD was handed. */
function lastView(render: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const calls = render.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

function message(state: PublicState): StateMessage {
  return { version: PROTOCOL_VERSION, mapId: 'street', state };
}

beforeEach(() => setLocale('pt-BR'));

describe('the match scene', () => {
  it('hands the HUD the state, with the human unit on turn selected', () => {
    const { session, render } = startMatch();
    const state = stateFor({ onTurn: 'A', spent: false });

    session.emit.state(message(state));

    const view = lastView(render);
    expect(view.state).toBe(state);
    expect(view.selectedId).toBe('A-sniper');
    expect(view.humanTeam).toBe('A');
  });

  it('sends the end of the turn with the round the state is on, when the player presses it', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    (scene as unknown as { pressAction(id: string, mode: null): void }).pressAction('endTurn', null);

    expect(session.send).toHaveBeenCalledWith({ type: 'endTurn', round: 4 });
  });

  it('counts down a turn with nothing left, sends the end once, and hands the turn back when refused', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: true })));
    expect(lastView(render).autoEndTurn).toMatchObject({ phase: 'counting' });

    scene.update(100);
    scene.update(2200);
    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.send).toHaveBeenCalledWith({ type: 'endTurn', round: 4 });

    // The server refuses it: the log says why, and the player is left with the hint, not a new order.
    session.emit.rejected('not-your-turn');
    expect(lastView(render).logLines).toContain('Não é a sua vez');
    expect(lastView(render).autoEndTurn).toMatchObject({ phase: 'hinting' });

    scene.update(9000);
    expect(session.send).toHaveBeenCalledTimes(1);
  });

  it('never counts down the bot\'s turn, even when the bot has nothing left', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'B', spent: true })));

    scene.update(100);
    scene.update(9000);

    expect(session.send).not.toHaveBeenCalled();
  });

  it('reads no board press while the view is still turning (DT-86)', () => {
    const { scene, session, render } = startMatch();
    const state = stateFor({ onTurn: 'A', spent: false });
    session.emit.state(message(state));

    const press = (
      scene as unknown as {
        pressOnCell(s: PublicState, c: { x: number; y: number }, sec: boolean): void;
      }
    ).pressOnCell.bind(scene);

    // With the view standing still, the question is asked and the board is drawn again for it.
    const still = render.mock.calls.length;
    press(state, { x: 7, y: 7 }, true);
    expect(render.mock.calls.length).toBeGreaterThan(still);

    // Mid-turn the board on the screen is the one being drawn away from, so the press names no cell.
    (scene as unknown as { turn: unknown }).turn = { from: null, steps: 1, startedAt: 0, view: null };
    const turning = render.mock.calls.length;
    press(state, { x: 7, y: 7 }, true);

    expect(render.mock.calls.length).toBe(turning);
  });

  it('opens the inspection on a secondary press, and closes it with the X alone (Q4)', () => {
    const { scene, session, render } = startMatch();
    const state = stateFor({ onTurn: 'A', spent: false });
    session.emit.state(message(state));

    /** The scene's press path, as the pointer handlers reach it. */
    const scene_ = scene as unknown as {
      pressOnCell(s: PublicState, c: { x: number; y: number }, sec: boolean): void;
      hudTakesPress(p: { x: number; y: number }): boolean;
    };

    // The secondary gesture asks about the enemy on that cell: the HUD is handed a sheet for it.
    scene_.pressOnCell(state, { x: 7, y: 7 }, true);
    expect(lastView(render).inspectedId).toBe('B-priest');

    // A press on the board acts as usual and leaves the window open.
    scene_.pressOnCell(state, { x: 0, y: 0 }, false);
    expect(lastView(render).inspectedId).toBe('B-priest');

    // A press inside the window, clear of the X, is the window's own and changes nothing.
    const inside = { x: INSPECT_RECT.x + 8, y: INSPECT_RECT.y + INSPECT_RECT.height - 8 };
    expect(scene_.hudTakesPress(inside)).toBe(true);
    expect(lastView(render).inspectedId).toBe('B-priest');

    // The X is the one press that closes it.
    const close = { x: INSPECT_CLOSE_RECT.x + 1, y: INSPECT_CLOSE_RECT.y + 1 };
    expect(scene_.hudTakesPress(close)).toBe(true);
    expect(lastView(render).inspectedId).toBeNull();
  });

  it('starts with the log closed and opens it from its own header (Q3)', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    expect(lastView(render).logOpen).toBe(false);

    const scene_ = scene as unknown as { hudTakesPress(p: { x: number; y: number }): boolean };

    // The header is the toggle, and it is in the same place whether the box is open or closed.
    const header = { x: LOG_TOGGLE_RECT.x + 8, y: LOG_TOGGLE_RECT.y + 8 };
    expect(scene_.hudTakesPress(header)).toBe(true);
    expect(lastView(render).logOpen).toBe(true);
    expect(scene_.hudTakesPress(header)).toBe(true);
    expect(lastView(render).logOpen).toBe(false);

    // The rest of the box is the HUD's too: the line it shows while closed reaches no tile under it.
    const body = { x: LOG_RECT.x + 8, y: LOG_TOGGLE_RECT.y + LOG_TOGGLE_RECT.height + 4 };
    expect(scene_.hudTakesPress(body)).toBe(true);
    expect(lastView(render).logOpen).toBe(false);
  });

  it('drives the gesture rules of press.ts, so a tap acts and a drag does not (DT-84)', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as {
      handlePointerDown(p: unknown): void;
      handlePointerMove(p: unknown): void;
      handlePointerUp(p: unknown): void;
      feetOf(c: { x: number; y: number }): { x: number; y: number };
    };
    // The world point of the human unit's cell: a press there selects it, so the board really acted.
    const feet = scene_.feetOf({ x: 0, y: 0 });
    const at = (x: number, y: number) => ({
      id: 1,
      x,
      y,
      worldX: feet.x,
      worldY: feet.y,
      rightButtonDown: () => false,
      wasTouch: true,
    });

    const still = render.mock.calls.length;
    scene_.handlePointerDown(at(640, 300));
    scene_.handlePointerUp(at(640, 300));
    expect(render.mock.calls.length).toBeGreaterThan(still);

    // The same press, but one that travelled: it is panning the map and never presses the board.
    const afterTap = render.mock.calls.length;
    scene_.handlePointerDown(at(640, 300));
    scene_.handlePointerMove(at(700, 300));
    scene_.handlePointerUp(at(700, 300));
    expect(render.mock.calls.length).toBe(afterTap);
  });

  it('arms the long press for a finger and never for a mouse (DT-84)', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as {
      handlePointerDown(p: unknown): void;
      handlePointerUp(p: unknown): void;
      pressTimer: unknown;
    };
    const at = (touch: boolean) => ({
      id: 1,
      x: 640,
      y: 300,
      worldX: 0,
      worldY: 0,
      rightButtonDown: () => false,
      wasTouch: touch,
    });

    scene_.handlePointerDown(at(true));
    expect(scene_.pressTimer).not.toBeNull();
    scene_.handlePointerUp(at(true));
    expect(scene_.pressTimer).toBeNull();

    scene_.handlePointerDown(at(false));
    expect(scene_.pressTimer).toBeNull();
    scene_.handlePointerUp(at(false));
  });

  it('keeps the two chips of a pending move that spent the whole budget (DT-81)', () => {
    const { scene, session, render } = startMatch();
    const spent = stateFor({ onTurn: 'A', spent: true });
    // A run that used every movement point: nothing is left to move with, and the run is still open,
    // so Confirmar and Cancelar are the only things the player may press (EA-5, D3/D4).
    const state: PublicState = { ...spent, pendingMove: { from: { x: 0, y: 0 }, cost: 3 } };
    (scene as unknown as { mode: string }).mode = 'move';

    session.emit.state(message(state));

    // The mode falls back, because the unit cannot move again — and that must not take the chips down
    // with it: they are read from the pending run, which is still open.
    expect(lastView(render).mode).toBe('inspect');
    expect(lastView(render).moveChips).toHaveLength(2);

    // And the countdown keeps waiting for Confirmar, however little of the turn is left (Q1): a run
    // that is still open is not a turn that has nothing left to do.
    expect(lastView(render).autoEndTurn).toMatchObject({ phase: 'idle' });
  });

  it('shows the result and the way out when the match ends', () => {
    const { session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    session.emit.ended('A');

    const view = lastView(render);
    expect(view.finished).toBe(true);
    expect(view.wayOutVisible).toBe(true);
    expect(view.result).toBe('Vitória');
  });
});
