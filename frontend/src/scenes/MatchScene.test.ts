// The match scene's wiring (DT-41): what the scene does with the server's messages and the player's
// presses. Phaser is a stand-in here (see `testing/phaser-stub.ts`), so these tests read what the
// scene decides and hands the HUD; the drawing is still checked by hand in a browser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  type AbilityDefinition,
  type BoardState,
  type Event,
  type PublicState,
  type RejectReason,
  type StateMessage,
  type Team,
  type UnitId,
  type UnitState,
} from '../protocol';
import type { Session } from '../net/session';
import { setLocale, t } from '../i18n/translate';
import {
  ABILITY_MENU_RECT,
  BATTLE_REPORT_CLOSE_RECT,
  BATTLE_REPORT_EXPORT_RECT,
  BATTLE_REPORT_RECT,
  BATTLE_REPORT_REOPEN_RECT,
  BATTLE_REPORT_SCROLL_DOWN_RECT,
  BATTLE_REPORT_SCROLL_UP_RECT,
  CAROUSEL_SLOT,
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  LEGEND_RECT,
  LOG_RECT,
  LOG_TOGGLE_RECT,
  RESULT_BUTTON_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_COVERS_ROW_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_PAN_MINUS_RECT,
  SETTINGS_PAN_PLUS_RECT,
  abilityMenuRowRect,
  carouselSlotRect,
} from '../view/layout';
import { MatchScene } from './MatchScene';
import { UnitSprite } from './units';
import { EFFECTS } from '../view/effects';
import { ATTACK_TIMELINE } from '../view/animation';
import { LAYER } from '../view/depth';
import { highlightedCells } from '../game/highlight';
import { BODY_HEIGHT } from '../view/unit-look';
import { type Cell, type Pixel } from '../view/grid';
import { download } from './download';
import { exportFileName, exportText } from '../game/battle-report';

/** What the stand-in map was told, so a test can read back the calls the canvas would have painted. */
const mapCalls = vi.hoisted(() => ({ marksVisible: [] as boolean[] }));

/** The impacts the scene asked to be drawn, which is where the ability art is decided (EA-16). */
const impactCalls = vi.hoisted(() => ({ impacts: [] as unknown[] }));

vi.mock('phaser', async () => ({ default: (await import('./testing/phaser-stub')).stub() }));
// The effects are drawn on the canvas the Node run does not have, so the scene's own drawing is a
// stand-in here: what the test reads is the impact the scene plays, not the pixels it would paint.
vi.mock('./effects', () => ({
  playEffect: () => {},
  playImpact: (_scene: unknown, impact: unknown) => void impactCalls.impacts.push(impact),
}));
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

/** The one ability the catalog of the cases below defines (ADR 0016 §1). */
const FIREBALL: AbilityDefinition = {
  id: 'fireball',
  cost: 2,
  range: 3,
  needsSight: true,
  effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
};

/** The one heal effect of the cases below (EA-18): it never rolls, so no badge should ever name it. */
const AREA_HEAL: AbilityDefinition = {
  id: 'area-heal',
  cost: 2,
  range: 3,
  needsSight: false,
  effect: { kind: 'heal', amount: 3, radius: 1 },
};

/** A sniper and an enemy two cells apart, in range and in sight of each other, for the preview cases. */
function attackScenario(): PublicState {
  const sniper = makeUnit('A-sniper', 'A', 0, 0);
  const enemy = makeUnit('B-priest', 'B', 2, 0);
  return {
    seed: 1,
    board: BOARD,
    catalog: [],
    units: [sniper, enemy],
    initiative: ['A-sniper', 'B-priest'],
    currentIndex: 0,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
  };
}

/**
 * A caster carrying `ability` in its first active set, an ally and an enemy inside the radius an aim
 * at the caster's own cell would cover, and a fourth unit far outside it (EA-18).
 */
function abilityScenario(ability: AbilityDefinition): PublicState {
  const caster: UnitState = {
    ...makeUnit('A-wizard', 'A', 2, 0),
    primaryClass: 'wizard',
    resourceKind: 'mana',
    ammo: 2,
    abilities: { activeSets: [ability.id, null], reaction: null, movement: null, support: null },
  };
  const ally = makeUnit('A-sniper', 'A', 1, 0);
  const enemy = makeUnit('B-priest', 'B', 3, 0);
  const far = makeUnit('B-far', 'B', 6, 6);
  return {
    seed: 1,
    board: BOARD,
    catalog: [ability],
    units: [caster, ally, enemy, far],
    initiative: ['A-wizard', 'A-sniper', 'B-priest', 'B-far'],
    currentIndex: 0,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
  };
}

/**
 * The same match with a caster on turn: a magic class carrying a fireball in its first active set, and
 * the catalog that defines it, which travels with the state (ADR 0016 §3, §6). The pool holds `mana`
 * points, so a menu row can be read as affordable or not.
 */
function casterState(mana = 2): PublicState {
  const state = stateFor({ onTurn: 'A', spent: false });
  const sniper = state.units[0];
  const caster: UnitState = {
    ...sniper,
    primaryClass: 'wizard',
    magazine: 3,
    ammo: mana,
    resourceKind: 'mana',
    abilities: { ...sniper.abilities, activeSets: ['fireball', null] },
  };

  return { ...state, units: [caster, state.units[1]], catalog: [FIREBALL] };
}

interface FakeSession extends Session {
  send: ReturnType<typeof vi.fn>;
  emit: {
    state(message: StateMessage): void;
    events(events: readonly Event[]): void;
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
      events: (events: readonly Event[]) => handlers.events(events as never),
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

  it('plays the first of a burst of actions at once, and holds the next back (M4 playtest fix, P2)', () => {
    const { session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const first = { ...stateFor({ onTurn: 'B', spent: false }), round: 5 };
    const second = { ...stateFor({ onTurn: 'A', spent: false }), round: 6 };

    // Two accepted actions landing back to back, each with its own events-then-state pair, exactly as
    // `playBotTurns` broadcasts a bot's whole turn with no pacing of its own (battle-room.ts).
    session.emit.events([{ type: 'turn-ended', actor: 'A-sniper', next: 'B-priest', round: 4 }]);
    session.emit.state(message(first));
    session.emit.events([{ type: 'turn-ended', actor: 'B-priest', next: 'A-sniper', round: 5 }]);
    session.emit.state(message(second));

    // The first step played at once, since the queue was idle: the HUD already reads its state.
    expect(lastView(render).state).toBe(first);

    // The second is still queued behind it — nothing fires its timer in this test — so the HUD has not
    // moved on to it yet, which is what stops a burst from showing its last action before the first
    // has had the time its own cues need.
    expect(lastView(render).state).not.toBe(second);
  });

  it('tells the target to hold its result until the swing lands, not at the start of it (M4 playtest fix, P2)', () => {
    const { session } = startMatch();
    const initial = stateFor({ onTurn: 'A', spent: false });
    session.emit.state(message(initial));

    const spy = vi.spyOn(UnitSprite.prototype, 'expectImpact');

    // A-sniper (0,0) to B-priest (7,7) is well past melee reach, so the shot travels (`attackStyle`,
    // `view/effects.ts`): the result must wait for the tracer to arrive, not show at the first frame.
    session.emit.events([
      { type: 'attacked', actor: 'A-sniper', target: 'B-priest', hit: true, damage: 4, rngState: 1, resource: 'ammo', cover: false },
    ]);
    session.emit.state(
      message({
        ...initial,
        units: initial.units.map((unit) => (unit.id === 'B-priest' ? { ...unit, health: 8 } : unit)),
      }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const delayMs = spy.mock.calls[0]![1];
    expect(delayMs).toBe(ATTACK_TIMELINE.travelStart + EFFECTS.sniper.ranged.travelMs);
  });

  it('refuses every press the instant control changes hands, before the banner has had time to fade (M4 playtest fix, P3)', () => {
    const { scene, session } = startMatch();
    // The bot has the turn first, so the hand-over below is a real one and not the match's own
    // opening state, which raises a banner too but locks nothing (nobody has had a turn taken yet).
    session.emit.state(message(stateFor({ onTurn: 'B', spent: false })));
    session.emit.state(message(stateFor({ onTurn: 'A', spent: true })));

    (scene as unknown as { pressAction(id: string, mode: null): void }).pressAction('endTurn', null);

    expect(session.send).not.toHaveBeenCalled();
  });

  it('re-renders the bar on its own the instant a lock clears, with no other press needed (critical fix, P3)', () => {
    const { scene, session, render } = startMatch();
    const scene_ = scene as unknown as {
      advanceQueue(): void;
      update(time: number): void;
    };

    // The human's own turn throughout, so no hand-over banner ever enters into it: only the queue's
    // own pacing is what locks the bar below, which is the half a camera move was papering over.
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    // One accepted action lands — a move that leaves the same unit on turn, exactly as the first of
    // several actions in one turn would. The bar locks while it plays: the HUD is pushed showing it
    // locked, the same every actual action already does.
    session.emit.events([{ type: 'moved', actor: 'A-sniper', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, path: [{ x: 1, y: 0 }] }]);
    session.emit.state(message({ ...stateFor({ onTurn: 'A', spent: false }), round: 5 }));
    expect(
      (lastView(render).buttons as { enabled: boolean }[]).every((button) => !button.enabled),
    ).toBe(true);

    // The step's own wait elapses and the queue goes idle — the only thing that happened is a timer
    // firing with nothing left to play, which today calls nothing that redraws the HUD at all.
    scene_.advanceQueue();

    // A frame passing on its own, with no press and no camera move, must be enough on its own to show
    // the bar as usable again: the player must never have to touch something unrelated, like the
    // camera, to get the panel to notice the lock is already gone.
    scene_.update(0);

    expect(
      (lastView(render).buttons as { enabled: boolean }[]).some((button) => button.enabled),
    ).toBe(true);
  });

  it('never leaves the queue stuck forever when applying a step throws (critical fix)', () => {
    const { scene, session, render } = startMatch();
    const scene_ = scene as unknown as { advanceQueue(): void };
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    // Something inside this step's own presentation breaks — a bad import, a stale build, anything —
    // the same shape as the real incident this guards: a thrown error reaching all the way out of
    // `applyStep`. The player must never be stuck on a dead turn for the rest of the match over it.
    const spy = vi
      .spyOn(MatchScene.prototype as unknown as { applyStep: () => unknown }, 'applyStep')
      .mockImplementationOnce(() => {
        throw new TypeError('hitChanceFor is not a function');
      });

    session.emit.events([{ type: 'turn-ended', actor: 'A-sniper', next: 'B-priest', round: 4 }]);
    expect(() =>
      session.emit.state(message({ ...stateFor({ onTurn: 'B', spent: false }), round: 5 })),
    ).not.toThrow();
    spy.mockRestore();

    // The step's own timer still gets scheduled even though applying it failed, which this harness
    // never fires on its own (it never fires Phaser's own timers at all) — simulated here, since it is
    // exactly what lets the queue move past a step that blew up instead of dying stuck behind it.
    scene_.advanceQueue();

    // A second, healthy action now proves the queue is not stuck: it plays normally, on its own.
    session.emit.events([{ type: 'turn-ended', actor: 'B-priest', next: 'A-sniper', round: 5 }]);
    const recovered = { ...stateFor({ onTurn: 'A', spent: false }), round: 6 };
    session.emit.state(message(recovered));

    expect(lastView(render).state).toBe(recovered);
  });

  it('loses the preview badge, not the game, if working out its odds throws (critical fix)', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    // The exact shape of the real incident: the player is aiming — the mode armed, a cell previewed —
    // when the HUD is pushed and the preview is asked about again.
    const scene_ = scene as unknown as {
      mode: string;
      previewCell: { x: number; y: number } | null;
      pushHud(): void;
    };
    scene_.mode = 'attack';
    scene_.previewCell = { x: 7, y: 0 };

    const spy = vi
      .spyOn(MatchScene.prototype as unknown as { computeTargetPreview: () => unknown }, 'computeTargetPreview')
      .mockImplementation(() => {
        throw new TypeError('hitChanceFor is not a function');
      });

    try {
      expect(() => scene_.pushHud()).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('sends the end of the turn at once when nothing is left to do (M4 playtest fix, P3)', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: true })));

    (scene as unknown as { pressAction(id: string, mode: null): void }).pressAction('endTurn', null);

    expect(session.send).toHaveBeenCalledWith({ type: 'endTurn', round: 4 });
  });

  it('asks once before ending a turn that still has something left, and sends it on the second press (M4 playtest fix, P3)', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as { pressAction(id: string, mode: null): void };
    scene_.pressAction('endTurn', null);

    expect(session.send).not.toHaveBeenCalled();
    expect(lastView(render).buttons).toContainEqual(
      expect.objectContaining({ id: 'endTurn', label: t('action.confirmEndTurn') }),
    );

    scene_.pressAction('endTurn', null);
    expect(session.send).toHaveBeenCalledWith({ type: 'endTurn', round: 4 });
  });

  it('puts the question down unanswered the moment the player presses anything else (M4 playtest fix, P3)', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

    const scene_ = scene as unknown as { pressAction(id: string, mode: string | null): void };
    scene_.pressAction('endTurn', null);
    scene_.pressAction('move', 'move');

    expect(lastView(render).buttons).toContainEqual(
      expect.objectContaining({ id: 'endTurn', label: t('action.endTurn') }),
    );

    scene_.pressAction('endTurn', null);
    expect(session.send).not.toHaveBeenCalled();
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

  it('opens the menu on Habilidade instead of arming the aim, and closes it on the second press', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(casterState()));

    const scene_ = scene as unknown as {
      pressAction(id: string, mode: string | null): void;
      hudTakesPress(p: { x: number; y: number }): boolean;
    };

    // The button asks before it arms (EA-16): the menu is up, with what the ability is called, what it
    // costs and what it does, and no mode has been armed yet.
    scene_.pressAction('ability', 'ability');
    const opened = lastView(render).abilityMenu as {
      open: boolean;
      options: { id: string; name: string; cost: string }[];
    };
    expect(opened.open).toBe(true);
    expect(opened.options).toEqual([
      {
        id: 'fireball',
        name: 'Bola de Fogo',
        cost: '2 Energia',
        detail: 'Dano 3 · raio 1 · ignora cobertura · atinge todos, inclusive aliados',
        affordable: true,
      },
    ]);
    expect(lastView(render).mode).toBe('inspect');

    // The bar is its own undo: the same button takes the question off the screen.
    scene_.pressAction('ability', 'ability');
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(false);
  });

  it('arms the row the player picks, and aims with the ability that row names', () => {
    const { scene, session, render } = startMatch();
    const state = casterState();
    session.emit.state(message(state));

    const scene_ = scene as unknown as {
      pressAction(id: string, mode: string | null): void;
      hudTakesPress(p: { x: number; y: number }): boolean;
      pressOnCell(s: PublicState, c: { x: number; y: number }, sec: boolean): void;
    };

    scene_.pressAction('ability', 'ability');
    const row = abilityMenuRowRect(0);
    expect(scene_.hudTakesPress({ x: row.x + 4, y: row.y + 4 })).toBe(true);

    // The pick closes the menu and leaves the aim armed, and the board then sends the ability itself.
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(false);
    expect(lastView(render).mode).toBe('ability');

    scene_.pressOnCell(state, { x: 2, y: 0 }, false);
    expect(session.send).toHaveBeenCalledWith({ type: 'useAbility', abilityId: 'fireball', to: { x: 2, y: 0 } });
  });

  it('arms nothing from a row the pool cannot pay, and lets the menu be closed from outside it', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(casterState(1)));

    const scene_ = scene as unknown as {
      pressAction(id: string, mode: string | null): void;
      hudTakesPress(p: { x: number; y: number }): boolean;
    };

    scene_.pressAction('ability', 'ability');
    const row = abilityMenuRowRect(0);
    scene_.hudTakesPress({ x: row.x + 4, y: row.y + 4 });

    // One point of mana against a cost of two (EA-16, D3): the row is drawn dimmed and arms nothing.
    expect(lastView(render).mode).toBe('inspect');
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(true);

    // A press outside the panel is the panel's own too, and it closes the question.
    expect(scene_.hudTakesPress({ x: 4, y: 4 })).toBe(true);
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(false);
  });

  it('takes every press while it is open, so the point under the question reaches no tile', () => {
    const { scene, session, render } = startMatch();
    const state = casterState();
    session.emit.state(message(state));

    const scene_ = scene as unknown as {
      pressAction(id: string, mode: string | null): void;
      hudTakesPress(p: { x: number; y: number }): boolean;
    };

    scene_.pressAction('ability', 'ability');

    // The title band of the panel is the panel's own: the press is taken and changes nothing.
    const title = { x: ABILITY_MENU_RECT.x + 8, y: ABILITY_MENU_RECT.y + 8 };
    expect(scene_.hudTakesPress(title)).toBe(true);
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(true);
    expect(lastView(render).inspectedId).toBeNull();

    // A press over the board is taken too, so it inspects nothing: it closes the question instead,
    // because the menu is a modal and one overlay is on the screen at a time (EA-16, D2).
    expect(scene_.hudTakesPress({ x: 700, y: 400 })).toBe(true);
    expect(lastView(render).inspectedId).toBeNull();
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(false);
  });

  it('takes the question off the screen when the turn can no longer answer it', () => {
    const { scene, session, render } = startMatch();
    session.emit.state(message(casterState()));

    (scene as unknown as { pressAction(id: string, mode: string | null): void }).pressAction('ability', 'ability');
    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(true);

    // The action is spent, so the engine would refuse every aim: the button goes with it, and so does
    // the menu that is still on the screen (EA-16).
    session.emit.state(message({ ...casterState(), hasActed: true }));

    expect((lastView(render).abilityMenu as { open: boolean }).open).toBe(false);
  });

  it('plays the impact of an ability on the cells the server said it covered (EA-16)', () => {
    const { scene, session } = startMatch();
    session.emit.state(message(casterState()));

    session.emit.events([
      { type: 'ability-used', actor: 'A-sniper', abilityId: 'fireball', to: { x: 2, y: 0 }, rngState: 7, resource: 'mana' },
    ]);
    // The server always sends the state right behind the events it caused (M4 playtest fix, P2): the
    // scene reads the two as one step, and plays the cues only once they are paired.
    session.emit.state(message(casterState()));

    // The event names the ability and the cell: the catalog says what it does there, and the engine
    // says which cells it covers, so the scene is asked to draw the blast and not a bare flash.
    expect(impactCalls.impacts).toEqual([
      {
        kind: 'blast',
        cell: { x: 2, y: 0 },
        cells: [
          { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
          { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
        ],
        color: EFFECTS.wizard.ranged.color,
      },
    ]);
    // The use is written into the log as well, which is where the player reads which ability was used
    // (EA-16). The names of the roster are not loaded in this run, so the log falls back to the id.
    expect((scene as unknown as { logLines: string[] }).logLines).toEqual([
      'A-sniper usou Bola de Fogo em (2,0)',
    ]);
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
      expect(badge.mock.calls.map(([sentence]) => sentence)).toEqual(['Cobertura: leste', null]);
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

  describe('the battle report (EA-17)', () => {
    function turnEnded(round: number, next: UnitId): Event {
      return { type: 'turn-ended', actor: 'A-sniper', next, round };
    }

    function tapAt(
      scene_: { handlePointerDown(p: unknown): void; handlePointerUp(p: unknown): void },
      x: number,
      y: number,
    ): void {
      const at = { id: 1, x, y, worldX: 0, worldY: 0, rightButtonDown: () => false, wasTouch: true };
      scene_.handlePointerDown(at);
      scene_.handlePointerUp(at);
    }

    it('opens the moment the match ends, seeded with every line played — not only the last six', () => {
      const { session, render } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      session.emit.events(Array.from({ length: 8 }, (_, i) => turnEnded(i + 1, 'B-priest')));
      // Paired right behind the events, as the server always sends it (M4 playtest fix, P2).
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      session.emit.ended('A');

      const view = lastView(render) as { battleReport: { open: boolean; lines: string[] } };
      expect(view.battleReport.open).toBe(true);
      expect(view.battleReport.lines).toHaveLength(8);
    });

    it('scrolls when the wheel is over the panel, and still zooms the camera everywhere else', () => {
      const { scene, session, render } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      session.emit.events(
        Array.from({ length: 20 }, (_, i) => turnEnded(i + 1, i % 2 === 0 ? 'B-priest' : 'A-sniper')),
      );
      // Paired right behind the events, as the server always sends it (M4 playtest fix, P2).
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      session.emit.ended('A');

      const scene_ = scene as unknown as {
        handleWheel(p: { x: number; y: number }, dy: number): void;
        camera: { zoom: number; centre: { x: number; y: number } };
      };

      const firstLineBefore = (lastView(render) as { battleReport: { lines: string[] } }).battleReport
        .lines[0];
      scene_.handleWheel({ x: BATTLE_REPORT_RECT.x + 10, y: BATTLE_REPORT_RECT.y + 10 }, 1);
      const firstLineAfter = (lastView(render) as { battleReport: { lines: string[] } }).battleReport
        .lines[0];
      expect(firstLineAfter).not.toBe(firstLineBefore);

      // The same wheel outside the panel is the camera's own, unaffected by the report being open.
      scene_.camera = { zoom: 1, centre: { x: 640, y: 360 } };
      scene_.handleWheel({ x: 10, y: 10 }, -1);
      expect(scene_.camera.zoom).toBeGreaterThan(1);
    });

    it('swallows a press over Sair while it stands over it, and closes on a press truly outside it (D2)', () => {
      const { scene, session, render } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      session.emit.ended('A');
      expect(lastView(render).battleReport).toMatchObject({ open: true });

      const scene_ = scene as unknown as {
        handlePointerDown(p: unknown): void;
        handlePointerUp(p: unknown): void;
      };

      // Sair sits inside the report's own rectangle while the report is open, so a press there is the
      // panel's own and leaves nothing — it neither closes the report nor reaches `Sair` underneath it.
      tapAt(scene_, RESULT_BUTTON_RECT.x + 1, RESULT_BUTTON_RECT.y + 1);
      expect(lastView(render).battleReport).toMatchObject({ open: true });
      expect(lastView(render).finished).toBe(true);

      // A press truly outside the panel closes it.
      tapAt(scene_, 5, 5);
      expect(lastView(render).battleReport).toMatchObject({ open: false });
      expect(lastView(render).wayOutVisible).toBe(true);
    });

    it('downloads exactly what exportText builds, through the download seam', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-13T15:04:05.000Z'));
      const spy = vi.spyOn(download, 'text').mockImplementation(() => {});

      try {
        const { scene, session } = startMatch();
        session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
        session.emit.events([turnEnded(1, 'B-priest')]);
        // Paired right behind the events, as the server always sends it (M4 playtest fix, P2).
        session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
        session.emit.ended('A');

        const scene_ = scene as unknown as {
          handlePointerDown(p: unknown): void;
          handlePointerUp(p: unknown): void;
        };
        tapAt(scene_, BATTLE_REPORT_EXPORT_RECT.x + 1, BATTLE_REPORT_EXPORT_RECT.y + 1);

        expect(spy).toHaveBeenCalledTimes(1);
        const [fileName, content] = spy.mock.calls[0]!;
        expect(fileName).toBe(exportFileName(new Date()));
        expect(content).toBe(exportText({ result: 'Vitória', endedAt: new Date() }, ['Vez de B-priest']));
      } finally {
        spy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('reopens from the link beside Sair once the report is closed', () => {
      const { scene, session, render } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      session.emit.ended('A');

      const scene_ = scene as unknown as {
        handlePointerDown(p: unknown): void;
        handlePointerUp(p: unknown): void;
      };

      tapAt(scene_, 5, 5); // outside every panel: closes the report, leaves nothing armed
      expect(lastView(render).battleReport).toMatchObject({ open: false });

      tapAt(scene_, BATTLE_REPORT_REOPEN_RECT.x + 1, BATTLE_REPORT_REOPEN_RECT.y + 1);
      expect(lastView(render).battleReport).toMatchObject({ open: true });
    });
  });

  describe('the hit-chance preview (EA-18)', () => {
    function pointerAt(
      scene_: { feetOf(c: { x: number; y: number }): { x: number; y: number } },
      cell: { x: number; y: number },
      touch: boolean,
    ) {
      const feet = scene_.feetOf(cell);
      return {
        id: 1,
        x: feet.x,
        y: feet.y,
        worldX: feet.x,
        worldY: feet.y,
        rightButtonDown: () => false,
        wasTouch: touch,
      };
    }

    it("sets the hovered enemy's badge to the attack chance, and clears it off the cell", () => {
      const { scene, session } = startMatch();
      session.emit.state(message(attackScenario()));
      (scene as unknown as { mode: string }).mode = 'attack';

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        expect(badge.mock.calls.some(([text]) => text !== null)).toBe(true);

        badge.mockClear();
        scene_.handlePointerMove(pointerAt(scene_, { x: 5, y: 5 }, false));
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);
      } finally {
        badge.mockRestore();
      }
    });

    it('shows nothing for an enemy outside the current attack reach', () => {
      const { scene, session } = startMatch();
      const sniper = makeUnit('A-sniper', 'A', 0, 0);
      const far = makeUnit('B-priest', 'B', 7, 7);
      const state: PublicState = {
        seed: 1,
        board: BOARD,
        catalog: [],
        units: [sniper, far],
        initiative: ['A-sniper', 'B-priest'],
        currentIndex: 0,
        movementLeft: 3,
        round: 1,
        hasActed: false,
        eventCount: 0,
        pendingMove: null,
      };
      session.emit.state(message(state));
      (scene as unknown as { mode: string }).mode = 'attack';

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 7, y: 7 }, false));
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);
      } finally {
        badge.mockRestore();
      }
    });

    it('shows one badge per living unit inside a fireball blast, allies and the caster included', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(abilityScenario(FIREBALL)));
      (scene as unknown as { mode: string; armedAbilityId: string | null }).mode = 'ability';
      (scene as unknown as { armedAbilityId: string | null }).armedAbilityId = 'fireball';

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));

        // state.units order: caster, ally, enemy, far — and so is the sprite map's own.
        const texts = badge.mock.calls.map(([text]) => text);
        expect(texts).toHaveLength(4);
        expect(texts[0]).not.toBeNull();
        expect(texts[1]).not.toBeNull();
        expect(texts[2]).not.toBeNull();
        expect(texts[3]).toBeNull();
      } finally {
        badge.mockRestore();
      }
    });

    it('shows no badge at all for a heal ability — it never rolls', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(abilityScenario(AREA_HEAL)));
      (scene as unknown as { mode: string; armedAbilityId: string | null }).mode = 'ability';
      (scene as unknown as { armedAbilityId: string | null }).armedAbilityId = 'area-heal';

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);
      } finally {
        badge.mockRestore();
      }
    });

    it(
      'shows the badge on a long press while aiming instead of opening the sheet; lifting clears it ' +
        'and a fresh tap still commits the shot',
      () => {
        const { scene, session } = startMatch();
        session.emit.state(message(attackScenario()));
        (scene as unknown as { mode: string }).mode = 'attack';

        const scene_ = scene as unknown as {
          handlePointerDown(p: unknown): void;
          handlePointerUp(p: unknown): void;
          triggerLongPress(p: unknown): void;
          feetOf(c: { x: number; y: number }): { x: number; y: number };
          inspectedId: string | null;
        };
        const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
        try {
          const pointer = pointerAt(scene_, { x: 2, y: 0 }, true);
          scene_.handlePointerDown(pointer);
          scene_.triggerLongPress(pointer);

          expect(badge.mock.calls.some(([text]) => text !== null)).toBe(true);
          expect(scene_.inspectedId).toBeNull();

          badge.mockClear();
          scene_.handlePointerUp(pointer);
          expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);

          // One gesture, one meaning (D4): the lift after a long press never taps. A fresh press does.
          scene_.handlePointerDown(pointer);
          scene_.handlePointerUp(pointer);
          expect(session.send).toHaveBeenCalledWith({ type: 'attack', target: 'B-priest' });
        } finally {
          badge.mockRestore();
        }
      },
    );

    it('clears every badge when the mode falls back, the turn moves on, or the match ends', () => {
      const { scene, session } = startMatch();
      const state = attackScenario();
      session.emit.state(message(state));
      (scene as unknown as { mode: string }).mode = 'attack';

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
        mode: string;
        pushHud(): void;
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        expect(badge.mock.calls.some(([text]) => text !== null)).toBe(true);

        badge.mockClear();
        scene_.mode = 'inspect';
        scene_.pushHud();
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);

        scene_.mode = 'attack';
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        badge.mockClear();
        session.emit.state(message({ ...state, currentIndex: 1 })); // the turn passes to the bot
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);

        scene_.mode = 'attack';
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        badge.mockClear();
        session.emit.ended('A');
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);
      } finally {
        badge.mockRestore();
      }
    });

    it('shows no badge while the camera is turning a quarter (DT-86)', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(attackScenario()));
      (scene as unknown as { mode: string }).mode = 'attack';
      (scene as unknown as { turn: unknown }).turn = {};

      const scene_ = scene as unknown as {
        handlePointerMove(p: unknown): void;
        feetOf(c: { x: number; y: number }): { x: number; y: number };
      };
      const badge = vi.spyOn(UnitSprite.prototype, 'setHitChanceBadge');
      try {
        scene_.handlePointerMove(pointerAt(scene_, { x: 2, y: 0 }, false));
        expect(badge.mock.calls.every(([text]) => text === null)).toBe(true);
      } finally {
        badge.mockRestore();
      }
    });
  });

  describe('the tile hover highlight', () => {
    /** The scene's own private surface, as these cases reach it. */
    interface HoverScene {
      feetOf(cell: Cell): Pixel;
      handlePointerMove(pointer: unknown): void;
      init(data: { session: Session }): void;
      hoveredCell: Cell | null;
    }

    /**
     * A mouse at a point of the screen and a point of the world, which are two different things
     * whenever the map is zoomed or panned: the hover reads both, as a press does (EA-8).
     */
    function mouse(at: Pixel, world: Pixel = at) {
      return {
        id: 1,
        x: at.x,
        y: at.y,
        worldX: world.x,
        worldY: world.y,
        rightButtonDown: () => false,
        wasTouch: false,
      };
    }

    /** The pointer over a tile of the board, which is where a mouse resting on it reports. */
    function overTile(scene: HoverScene, cell: Cell) {
      const feet = scene.feetOf(cell);
      return mouse(feet, feet);
    }

    /** One `Graphics` the scene created, as the stand-in canvas below reports it. */
    interface DrawnGraphic {
      depth: number | null;
      strokes: number;
      fills: number;
      destroyed: number;
    }

    /** The drawing calls of one stand-in `Graphics`, which answer with themselves like Phaser's do. */
    interface FakeGraphics {
      setDepth(...args: unknown[]): FakeGraphics;
      strokePoints(...args: unknown[]): FakeGraphics;
      fillPoints(...args: unknown[]): FakeGraphics;
      destroy(): void;
    }

    /**
     * A stand-in for `this.add`, so a case reads the marks the scene makes instead of the pixels it
     * would paint: every `Graphics` the scene makes is counted here, with the depth it was given and
     * whether it was stroked or filled. The array it fills is cleared by a case that only means to
     * read the drawing of one move.
     *
     * Only `graphics` is answered here: a unit also makes a sprite and a couple more graphics through
     * the same object, and those are the stand-in's own, so every other name is handed on untouched.
     *
     * It is defined rather than assigned: Phaser is a stand-in in this run and swallows a write to a
     * property the class does not declare, which is the shape `add` has.
     */
    function recordDraws(scene: MatchScene): DrawnGraphic[] {
      const drawn: DrawnGraphic[] = [];
      const stand = scene.add as unknown as Record<string, unknown>;
      /** One of the stand-in's own graphics, which answers every drawing call a mark makes. */
      const blank = (stand.graphics as () => object)();

      function graphics(): FakeGraphics {
        const record: DrawnGraphic = { depth: null, strokes: 0, fills: 0, destroyed: 0 };
        drawn.push(record);

        const api = new Proxy(blank, {
          get: (target, property) => {
            if (property === 'setDepth') {
              return (depth: number) => {
                record.depth = depth;
                return api;
              };
            }
            if (property === 'strokePoints') {
              return () => {
                record.strokes += 1;
                return api;
              };
            }
            if (property === 'fillPoints') {
              return () => {
                record.fills += 1;
                return api;
              };
            }
            if (property === 'destroy') {
              return () => {
                record.destroyed += 1;
              };
            }

            // Every other call is drawing this case does not read — `clear`, `lineStyle`, a fill of a
            // colour — so it goes to the stand-in, and the answer is this mark again, so a chain of
            // them is read on the same record.
            const value = Reflect.get(target, property) as unknown;
            if (typeof value !== 'function') return value;

            return (...args: unknown[]) => {
              (value as (...rest: unknown[]) => unknown).apply(target, args);
              return api;
            };
          },
        });

        return api as unknown as FakeGraphics;
      }

      Object.defineProperty(scene, 'add', {
        configurable: true,
        value: new Proxy(stand, {
          get: (target, property) => (property === 'graphics' ? graphics : Reflect.get(target, property)),
        }),
      });

      return drawn;
    }

    it('outlines the tile under the mouse, and takes the mark down off the board', () => {
      const { scene, session } = startMatch();
      const drawn = recordDraws(scene);
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      const hover = scene as unknown as HoverScene;
      drawn.length = 0;
      hover.handlePointerMove(overTile(hover, { x: 3, y: 3 }));

      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });
      // One mark, stroked once and never filled (D2), in the hover tier of the depth table (DT-47).
      expect(drawn).toHaveLength(1);
      expect(drawn[0]!.strokes).toBe(1);
      expect(drawn[0]!.fills).toBe(0);
      expect(drawn[0]!.depth).toBe(LAYER.hover({ x: 3, y: 3 }));

      // Off the board there is no tile under the mouse at all, so the mark goes with it.
      const off = { x: -5000, y: -5000 };
      hover.handlePointerMove(mouse(off, off));

      expect(hover.hoveredCell).toBeNull();
      expect(drawn[0]!.destroyed).toBe(1);
    });

    it('marks the cell of a unit when the mouse is over its figure (EA-8)', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(attackScenario()));

      const hover = scene as unknown as HoverScene;
      // The middle of the body of B-priest, which stands over the tiles behind its own: the figure
      // names the unit, and the mark goes on the cell that unit is on — the cell a click would act on.
      const feet = hover.feetOf({ x: 2, y: 0 });
      hover.handlePointerMove(mouse({ x: feet.x, y: feet.y - BODY_HEIGHT / 2 }));

      expect(hover.hoveredCell).toEqual({ x: 2, y: 0 });
    });

    it('marks the cell of a unit from its portrait, with the pointer nowhere near the board', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      const hover = scene as unknown as HoverScene;
      // The first portrait of the turn queue shows A-sniper: the mark goes on the cell it stands on,
      // wherever in the world the mouse is — this one has never been over the board.
      const portrait = carouselSlotRect(0);
      const onPortrait = { x: portrait.x + portrait.width / 2, y: portrait.y + portrait.height / 2 };
      const nowhere = { x: -5000, y: -5000 };
      hover.handlePointerMove(mouse(onPortrait, nowhere));
      expect(hover.hoveredCell).toEqual({ x: 0, y: 0 });

      // The gap between two portraits is the HUD's, not a unit's (EA-8): nothing is marked there.
      const gap = { x: portrait.x + portrait.width + CAROUSEL_SLOT.gap / 2, y: onPortrait.y };
      hover.handlePointerMove(mouse(gap, nowhere));

      expect(hover.hoveredCell).toBeNull();
    });

    it('draws the mark of the tile over the wash under it, neither one suppressing the other', () => {
      const { scene, session } = startMatch();
      const state = stateFor({ onTurn: 'A', spent: false });
      (scene as unknown as { mode: string }).mode = 'move';
      session.emit.state(message(state));

      const hover = scene as unknown as HoverScene;
      const wash = (scene as unknown as { highlights: unknown[] }).highlights;
      expect(wash.length).toBeGreaterThan(0);

      // One tile the armed move offers: the two marks answer two different questions, so both are on
      // the screen over it.
      const cell = { x: 0, y: 1 };
      expect(highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' })).toContainEqual(cell);

      const drawn = recordDraws(scene);
      hover.handlePointerMove(overTile(hover, cell));

      expect(hover.hoveredCell).toEqual(cell);
      expect(drawn.filter((graphic) => graphic.depth === LAYER.hover(cell))).toHaveLength(1);
      expect((scene as unknown as { highlights: unknown[] }).highlights).toHaveLength(wash.length);
    });

    it('marks nothing under a point the HUD covers, even where the board sits behind it', () => {
      const { scene, session } = startMatch();
      const state = casterState();
      session.emit.state(message(state));

      const hover = scene as unknown as HoverScene & {
        hudTakesPress(point: Pixel): boolean;
        pressAction(id: string, mode: string | null): void;
        pressOnCell(state: PublicState, cell: Cell, secondary: boolean): void;
      };

      // The world point is over a tile of the board the whole time: only the screen point moves, which
      // is exactly what a panel floating over the board looks like to the hover.
      const world = hover.feetOf({ x: 3, y: 3 });
      hover.handlePointerMove(mouse(world));
      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });

      // A band of `hudRects` no control sits on is still the HUD's, and a press there reaches no tile.
      hover.handlePointerMove(mouse({ x: LEGEND_RECT.x + 4, y: LEGEND_RECT.y + 4 }, world));
      expect(hover.hoveredCell).toBeNull();

      // The log, open or closed, is its own box.
      hover.handlePointerMove(mouse({ x: LOG_RECT.x + 8, y: LOG_RECT.y + 8 }, world));
      expect(hover.hoveredCell).toBeNull();

      // The gear, and the panel it opens over the board.
      hover.hudTakesPress({ x: SETTINGS_BUTTON_RECT.x + 1, y: SETTINGS_BUTTON_RECT.y + 1 });
      hover.handlePointerMove(mouse({ x: SETTINGS_PANEL_RECT.x + 8, y: SETTINGS_PANEL_RECT.y + 8 }, world));
      expect(hover.hoveredCell).toBeNull();

      // The inspection window a secondary press opens. The cell is the one the enemy stands on: a press
      // on an empty tile has no unit to ask about and opens nothing.
      hover.pressOnCell(state, { x: 7, y: 7 }, true);
      hover.handlePointerMove(mouse({ x: INSPECT_RECT.x + 8, y: INSPECT_RECT.y + 8 }, world));
      expect(hover.hoveredCell).toBeNull();

      // And the ability menu, which takes every point of the canvas while it is up.
      hover.pressAction('ability', 'ability');
      hover.handlePointerMove(mouse({ x: ABILITY_MENU_RECT.x + 8, y: ABILITY_MENU_RECT.y + 8 }, world));
      expect(hover.hoveredCell).toBeNull();
    });

    it('marks nothing for a finger, which has no hover at all (EA-18, D1)', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      const hover = scene as unknown as HoverScene;
      const feet = hover.feetOf({ x: 3, y: 3 });

      // The gesture rules answer `none` for a finger that is not down, so no branch of the move runs.
      hover.handlePointerMove({ ...mouse(feet, feet), wasTouch: true });
      expect(hover.hoveredCell).toBeNull();

      // The same move from a mouse is the hover, which is the one answer a finger never gets.
      hover.handlePointerMove(mouse(feet, feet));
      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });
    });

    it('opens a match with nothing marked, and clears the mark the moment it is decided (D5)', () => {
      const { scene, session } = startMatch();
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      const hover = scene as unknown as HoverScene;
      expect(hover.hoveredCell).toBeNull();
      hover.handlePointerMove(overTile(hover, { x: 3, y: 3 }));
      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });

      // A new match reuses the scene: nothing the last one marked outlives it.
      hover.init({ session });
      expect(hover.hoveredCell).toBeNull();

      // And once the match is decided there is no board being played, so nothing on it is marked —
      // not through the result screen, and not through the battle report over it either (D5).
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));
      hover.handlePointerMove(overTile(hover, { x: 3, y: 3 }));
      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });

      session.emit.ended('A');
      expect(hover.hoveredCell).toBeNull();

      hover.handlePointerMove(overTile(hover, { x: 3, y: 3 }));
      expect(hover.hoveredCell).toBeNull();
    });

    it('keeps the mark of a tile the mouse has not left, without building it again (DT-46)', () => {
      const { scene, session } = startMatch();
      const drawn = recordDraws(scene);
      session.emit.state(message(stateFor({ onTurn: 'A', spent: false })));

      const hover = scene as unknown as HoverScene;
      const pointer = overTile(hover, { x: 3, y: 3 });

      // A mouse resting on a tile reports the same point again and again: the mark is kept, and none
      // of those reports throws it away to make it again.
      drawn.length = 0;
      hover.handlePointerMove(pointer);
      hover.handlePointerMove(pointer);
      hover.handlePointerMove(pointer);

      expect(hover.hoveredCell).toEqual({ x: 3, y: 3 });
      expect(drawn).toHaveLength(1);
    });
  });
});
