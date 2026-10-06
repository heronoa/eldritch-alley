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
import { MatchScene } from './MatchScene';

vi.mock('phaser', async () => ({ default: (await import('./testing/phaser-stub')).stub() }));
// The map is painted on canvases the Node run does not have: the scene's wiring does not depend on it.
vi.mock('./map/MapView', () => ({
  MapView: class {
    destroy() {}
    update() {}
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
