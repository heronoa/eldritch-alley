// The match scene's wiring (DT-41): what the scene does with the server's messages and the player's
// presses. Phaser is a stand-in here (see `testing/phaser-stub.ts`), so these tests read what the
// scene decides and hands the HUD; the drawing is still checked by hand in a browser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  type BoardState,
  type PublicState,
  type RejectReason,
  type StateMessage,
  type Team,
  type UnitId,
  type UnitState,
} from '../protocol';
import type { Session } from '../net/session';
import { setLocale } from '../i18n/translate';
import {
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  LOG_RECT,
  LOG_TOGGLE_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_COVERS_ROW_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_PAN_MINUS_RECT,
  SETTINGS_PAN_PLUS_RECT,
} from '../view/layout';
import { MatchScene } from './MatchScene';
import { UnitSprite } from './units';

/** What the stand-in map was told, so a test can read back the calls the canvas would have painted. */
const mapCalls = vi.hoisted(() => ({ marksVisible: [] as boolean[] }));

vi.mock('phaser', async () => ({ default: (await import('./testing/phaser-stub')).stub() }));
// The map is painted on canvases the Node run does not have: the scene's wiring does not depend on it.
// `setCovered` is the call that would paint the building the view cuts down (EA-12, slice 4): here it
// only has to exist, because the canvas is not there to be set translucent.
vi.mock('./map/MapView', () => ({
  MapView: class {
    destroy() {}
    update() {}
    setCovered(_cells: readonly { x: number; y: number }[]) {}
    setMarksVisible(visible: boolean) {
      mapCalls.marksVisible.push(visible);
    }
  },
}));

const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

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
    facing: 'E',
    resourceKind: 'ammo',
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
    catalog: [],
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

const HIGHLIGHT_COVERS_KEY = 'eldritch-alley.highlightCovers';

/**
 * A browser storage with what it already holds, and the writes the scene makes to it. The settings are
 * read at boot, so this has to be in place before the scene is created.
 */
function withStorage(saved: Record<string, string> = {}): Record<string, string> {
  const writes: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (writes[key] = value),
  };
  return writes;
}

beforeEach(() => setLocale('pt-BR'));
beforeEach(() => {
  mapCalls.marksVisible.length = 0;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

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

  it('steps the drag sensitivity from the settings panel, and stops at each end (owner)', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as { hudTakesPress(p: { x: number; y: number }): boolean };
    const at = (rect: { x: number; y: number }) => ({ x: rect.x + 1, y: rect.y + 1 });

    // The gear opens the panel, and the drag starts on the step the owner chose as the default.
    expect(scene_.hudTakesPress(at(SETTINGS_BUTTON_RECT))).toBe(true);
    expect(lastView(render).settingsOpen).toBe(true);
    expect(lastView(render).panSensitivity).toMatchObject({
      percent: 50,
      canDecrease: true,
      canIncrease: true,
    });

    // `+` climbs a step at a time and gives out at the top; a press past the top changes nothing.
    expect(scene_.hudTakesPress(at(SETTINGS_PAN_PLUS_RECT))).toBe(true);
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 75 });
    scene_.hudTakesPress(at(SETTINGS_PAN_PLUS_RECT));
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 100, canIncrease: false });
    scene_.hudTakesPress(at(SETTINGS_PAN_PLUS_RECT));
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 100 });

    // `−` comes back down and gives out at the bottom.
    scene_.hudTakesPress(at(SETTINGS_PAN_MINUS_RECT));
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 75, canDecrease: true });
    scene_.hudTakesPress(at(SETTINGS_PAN_MINUS_RECT));
    scene_.hudTakesPress(at(SETTINGS_PAN_MINUS_RECT));
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 25, canDecrease: false });
    scene_.hudTakesPress(at(SETTINGS_PAN_MINUS_RECT));
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 25 });

    // The panel still swallows everything it covers: the title is the panel's own, and reaches no tile.
    const title = { x: SETTINGS_PANEL_RECT.x + 8, y: SETTINGS_PANEL_RECT.y + 8 };
    expect(scene_.hudTakesPress(title)).toBe(true);
    expect(lastView(render).panSensitivity).toMatchObject({ percent: 25 });
  });

  it('drags the map by the sensitivity, and leaves the keyboard step as it was (owner)', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as {
      camera: { zoom: number; centre: { x: number; y: number } };
      panSensitivity: number;
      handlePointerDown(p: unknown): void;
      handlePointerMove(p: unknown): void;
      handlePointerUp(p: unknown): void;
      moveCameraBy(dx: number, dy: number): void;
    };
    const at = (x: number, y: number) => ({
      id: 1,
      x,
      y,
      worldX: 0,
      worldY: 0,
      rightButtonDown: () => false,
      wasTouch: true,
    });
    // The camera starts on the middle of the canvas, and the gesture reports the whole travel from
    // where the finger went down, so the centre moves by that travel times the setting.
    const drag = (to: number) => {
      scene_.camera = { zoom: 1, centre: { x: 640, y: 360 } };
      scene_.handlePointerDown(at(640, 300));
      scene_.handlePointerMove(at(to, 300));
      scene_.handlePointerUp(at(to, 300));
    };

    scene_.panSensitivity = 50;
    drag(740); // 100 px of finger, half of them taken by the default
    expect(scene_.camera.centre.x).toBe(590);

    scene_.panSensitivity = 25;
    drag(740);
    expect(scene_.camera.centre.x).toBe(615);

    scene_.panSensitivity = 100; // the drag the game had before the setting existed
    drag(740);
    expect(scene_.camera.centre.x).toBe(540);

    // The keys never pass through the setting: the step they take is the one they always took.
    scene_.camera = { zoom: 1, centre: { x: 640, y: 360 } };
    scene_.moveCameraBy(80, 0);
    expect(scene_.camera.centre.x).toBe(720);
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

  it('hangs the cover badge over the units, naming the side the prop is on', () => {
    const { session } = startMatch();
    const board: BoardState = { ...BOARD, props: [{ position: { x: 1, y: 0 }, kind: 'cover' }] };
    const state = { ...stateFor({ onTurn: 'A', spent: false }), board };

    // Phaser's Text cannot be read back here (the stand-in swallows it), so the sentence is read at the
    // seam the scene hands it over: the sprite. The sides are the board's own, whatever the view is
    // turned to (ADR 0012 § D5).
    const badge = vi.spyOn(UnitSprite.prototype, 'setCoverBadge');
    try {
      session.emit.state(message(state));

      // Sniper stands at (0,0), with the crate on its east; the priest at (7,7) has none beside it.
      expect(badge.mock.calls.map(([sentence]) => sentence)).toEqual(['Em cobertura a leste', null]);
    } finally {
      badge.mockRestore();
    }
  });

  it('takes the badge off a unit that has fallen, which is covered by nothing', () => {
    const { session } = startMatch();
    const board: BoardState = { ...BOARD, props: [{ position: { x: 1, y: 0 }, kind: 'cover' }] };
    const down = { ...makeUnit('A-sniper', 'A', 0, 0), defeated: true };
    const state = {
      ...stateFor({ onTurn: 'A', spent: false }),
      board,
      units: [down, makeUnit('B-priest', 'B', 7, 7)],
    };

    const badge = vi.spyOn(UnitSprite.prototype, 'setCoverBadge');
    try {
      session.emit.state(message(state));

      expect(badge.mock.calls.map(([sentence]) => sentence)).toEqual([null, null]);
    } finally {
      badge.mockRestore();
    }
  });

  it('starts with the cover marks off when the browser was told so, and says so in the HUD', () => {
    withStorage({ [HIGHLIGHT_COVERS_KEY]: 'false' });
    const { session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    expect(lastView(render).highlightCovers).toBe(false);
    expect(mapCalls.marksVisible[mapCalls.marksVisible.length - 1]).toBe(false);
  });

  it('turns the cover marks on and off from the settings panel, and remembers the choice', () => {
    const writes = withStorage();
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as { hudTakesPress(p: { x: number; y: number }): boolean };
    const at = (rect: { x: number; y: number }) => ({ x: rect.x + 1, y: rect.y + 1 });
    // The marks are on for a build that says nothing, and the panel is where they are turned off.
    expect(lastView(render).highlightCovers).toBe(true);

    expect(scene_.hudTakesPress(at(SETTINGS_BUTTON_RECT))).toBe(true);
    expect(scene_.hudTakesPress(at(SETTINGS_COVERS_ROW_RECT))).toBe(true);

    expect(lastView(render).highlightCovers).toBe(false);
    expect(writes[HIGHLIGHT_COVERS_KEY]).toBe('false');
    expect(mapCalls.marksVisible[mapCalls.marksVisible.length - 1]).toBe(false);

    // And back on: the checkbox is one control, read the same way both ways.
    expect(scene_.hudTakesPress(at(SETTINGS_COVERS_ROW_RECT))).toBe(true);
    expect(lastView(render).highlightCovers).toBe(true);
    expect(writes[HIGHLIGHT_COVERS_KEY]).toBe('true');
    expect(mapCalls.marksVisible[mapCalls.marksVisible.length - 1]).toBe(true);
  });
});
