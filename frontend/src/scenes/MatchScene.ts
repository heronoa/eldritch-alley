// The match: draws the public state, turns clicks into actions, and shows what the server answers.
// It decides nothing on its own — every rule lives on the server, and every label, colour and
// coordinate comes from the tested `game/` and `view/` modules.
import Phaser from 'phaser';
import {
  actionButtons,
  applyMode,
  availableActions,
  moveChips,
  settleMode,
  type ActionButton,
  type ActionMode,
  type MoveChip,
} from '../game/actions';
import {
  endTurnAction,
  initialAutoEndTurn,
  readAutoEndTurn,
  saveAutoEndTurn,
  stepAutoEndTurn,
  type AutoEndStep,
  type AutoEndTurn,
  type AutoEndTurnEvent,
} from '../game/autoEndTurn';
import { highlightedCells, highlightTone } from '../game/highlight';
import { describeEvent, describeRejection, type UnitNames } from '../game/log';
import { presentationOf, type Cue, type Snapshot } from '../game/presentation';
import { resolveClick, resolveInspect } from '../game/selection';
import { activeSlot, isHumanTurn } from '../game/turn-order';
import { t } from '../i18n';
import { terrainOf, type Terrain } from '../maps/terrain';
import { Session } from '../net/session';
import {
  PROTOCOL_VERSION,
  type ClientAction,
  type EndedMessage,
  type Event,
  type PublicState,
  type RejectReason,
  type StateMessage,
  type Team,
} from '../protocol';
import { NO_FLOOR, type Cell, type Pixel } from '../view/grid';
import { MIN_ZOOM, zoomAbout, type CameraView } from '../view/camera';
import { LAYER } from '../view/depth';
import { cellAt, cellToScreen, topFace } from '../view/iso';
import {
  LOG_LINES,
  buttonIndexAt,
  COUNTDOWN_LINK_RECT,
  COUNTDOWN_RECT,
  RESULT_BUTTON_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_TOGGLE_RECT,
  containsPoint,
  hudRects,
  moveChipIndexAt,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  boardBounds,
} from '../view/layout';
import {
  HIGHLIGHT_ATTACK_ALPHA,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_ALPHA,
  HIGHLIGHT_MOVE_COLOR,
} from '../view/theme';
import { playEffect } from './effects';
import { MapView } from './map/MapView';
import { HudScene } from './HudScene';
import { BODY_HEIGHT, UnitSprite, type Placement } from './units';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';


/** How far one wheel notch, and one key press, zoom the map. */
const WHEEL_ZOOM_STEP = 1.15;
const KEY_ZOOM_STEP = 1.25;

/**
 * The secondary gesture of the inspection (EA-6, D4): how long a finger rests on a unit before the
 * gesture is an inspection instead of a tap, and how far it may drift while it rests. A finger that
 * travels further is panning the map, and a tap shorter than the press is an ordinary click.
 */
const LONG_PRESS_MS = 400;
const PRESS_SLOP_PX = 6;

/** The state carries no display name for a unit, so the log falls back to the id. */
const UNIT_NAMES: UnitNames = {};

/** What the presentation needs to know about a unit, so it never reads the whole state. */
function snapshotOf(state: PublicState): Map<string, Snapshot> {
  return new Map(
    state.units.map((unit) => [
      unit.id,
      { position: unit.position, primaryClass: unit.primaryClass, magazine: unit.magazine },
    ]),
  );
}

/** The two buttons that act at once, without a board target. The other two arm a mode instead. */
function immediateAction(id: ActionButton['id'], round: number): ClientAction | null {
  switch (id) {
    case 'reload':
      return { type: 'reload' };
    case 'endTurn':
      // The round goes with it, so a press that reaches the server after the match has moved on is
      // refused instead of ending the turn of whoever is up by then (ADR 0010).
      return { type: 'endTurn', round };
    default:
      return null;
  }
}

/** Whole seconds left of the countdown, rounded up: what the player is told, and all they are told. */
function secondsLeft(machine: AutoEndTurn): number {
  return Math.ceil(machine.remainingMs / 1000);
}

export class MatchScene extends Phaser.Scene {
  private session!: Session;
  private state: PublicState | null = null;
  private selectedId: string | null = null;
  /** The armed mode. `move` and `attack` narrow the next board click; `inspect` leaves it alone. */
  private mode: ActionMode = 'inspect';
  /** The unit the secondary gesture is inspecting, or null when no inspection is open (EA-6). */
  private inspectedId: string | null = null;
  /**
   * Where the finger that is down went down, or null when no tap is waiting. A press that is still
   * standing when the finger lifts is a tap shorter than the long press, and so an ordinary click; a
   * press that the long press already answered, or that travelled far enough to be a pan, is taken
   * down and the release does nothing (EA-6, D4).
   */
  private press: Pixel | null = null;
  private pressTimer: Phaser.Time.TimerEvent | null = null;
  private logLines: string[] = [];
  /** Set when the match is over or lost, after which clicks are ignored. */
  private finished = false;
  /** True while waiting for a reconnection, so the first state that arrives can clear the notice. */
  private reconnecting = false;

  /** The automatic end of turn (EA-4): the countdown nobody has to press, and the setting behind it. */
  private autoEndTurn: AutoEndTurn = initialAutoEndTurn();
  /** The unit the machine was last told about, so a hand-over starts the countdown from nothing. */
  private autoEndTurnUnit: string | null = null;
  /** Whether the settings panel the gear opens is on the screen. */
  private settingsOpen = false;
  /** The clock of the last frame, so the machine is handed elapsed time and never reads the clock. */
  private lastFrameMs = 0;

  /** One sprite per unit, kept for the whole match so an animation is never cut by a redraw. */
  private sprites = new Map<string, UnitSprite>();
  /** What the client knew of each unit when the last events arrived, for `presentationOf`. */
  private snapshot = new Map<string, Snapshot>();

  /** Built from the first state the map id names: the map is not known before it arrives. */
  private map: Terrain | null = null;
  private mapView: MapView | null = null;
  /** One graphic per highlighted cell, at the cell's own depth, rebuilt on every redraw. */
  private highlights: Phaser.GameObjects.Graphics[] = [];
  /** The HUD, in its own scene above the map. It is handed a view of the match and draws it. */
  private hud!: HudScene;
  /** The model the drawn buttons came from, so a click resolves to the action the player sees. */
  private buttonModel: ActionButton[] = [];
  /** The two controls of a pending move, for the same reason as the buttons (EA-5, D6). */
  private chipModel: MoveChip[] = [];
  private statusText = '';
  private resultText = '';
  /** Where the map camera is: its zoom, and the world point at the centre of the canvas. */
  private camera: CameraView = { zoom: MIN_ZOOM, centre: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 } };

  constructor() {
    super('match');
  }

  init(data: { session: Session }): void {
    this.session = data.session;
    this.state = null;
    this.selectedId = null;
    this.mode = 'inspect';
    this.inspectedId = null;
    this.cancelPress();
    this.logLines = [];
    this.finished = false;
    this.reconnecting = false;
    // The setting is read again on every match: another tab may have changed it since the last one.
    this.autoEndTurn = initialAutoEndTurn(readAutoEndTurn());
    this.autoEndTurnUnit = null;
    this.settingsOpen = false;
    this.lastFrameMs = 0;
    this.buttonModel = [];
    this.chipModel = [];
    this.statusText = '';
    this.resultText = '';
    this.camera = { zoom: MIN_ZOOM, centre: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 } };
    this.highlights = [];
    this.map = null;
    this.mapView = null;
    this.sprites = new Map();
    this.snapshot = new Map();
  }

  create(): void {
    // Drawing order is depth here, not the order things are added: the map carries the depth of each
    // of its cells, the highlights a hair over their own cell, the units half a step further, and the
    // whole HUD floats above all of it.
    //
    // The map is not here: it is only known once the state names it, and `handleState` builds it then.

    // The HUD runs in its own scene, above this one, so the map can be zoomed under it.
    this.scene.launch('hud');
    this.hud = this.scene.get('hud') as HudScene;
    this.applyCamera();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.trackPress(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    // The right button is the inspection on a desktop, so the menu of the browser must not eat it.
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, { x: pointer.x, y: pointer.y });
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const centre = { x: this.scale.width / 2, y: this.scale.height / 2 };
      if (event.key === '+' || event.key === '=') this.zoomBy(KEY_ZOOM_STEP, centre);
      if (event.key === '-') this.zoomBy(1 / KEY_ZOOM_STEP, centre);
    });

    // The map's canvases are textures of the game, not objects of this scene: leaving without taking
    // them out would pile a hundred of them up on the next match.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cancelPress();
      this.mapView?.destroy();
      this.mapView = null;
      this.map = null;
      this.scene.stop('hud');
    });

    this.session.onState((message) => this.handleState(message));
    this.session.onEvents((events) => this.handleEvents(events));
    this.session.onRejected((message) => this.handleRejected(message.reason));
    this.session.onEnded((message) => this.handleEnded(message));
    this.session.onDrop(() => {
      void this.handleDrop();
    });

  }

  /**
   * A press begins. The right button is the inspection and is read as one at once; a finger may still
   * become a long press, so a tap waits for its release to act; anything else clicks here and now
   * (EA-6, D4). The primary click is never the inspection: on an enemy it is the action itself.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      this.handlePress(pointer, true);
      return;
    }

    if (pointer.wasTouch) {
      this.armPress(pointer);
      return;
    }

    this.handlePress(pointer, false);
  }

  /** A finger that has rested long enough on a unit is inspecting it, not tapping the board (D4). */
  private armPress(pointer: Phaser.Input.Pointer): void {
    this.cancelPress();
    this.press = { x: pointer.x, y: pointer.y };
    this.pressTimer = this.time.delayedCall(LONG_PRESS_MS, () => {
      // The timer is spent, and taking the press down here is what keeps the release that follows from
      // clicking as well: one gesture, one meaning (D4).
      this.pressTimer = null;
      this.press = null;
      this.handlePress(pointer, true);
    });
  }

  /** A finger that travels is panning the map, so the press is neither an inspection nor a tap. */
  private trackPress(pointer: Phaser.Input.Pointer): void {
    if (this.press === null) return;

    const drift = Math.max(
      Math.abs(pointer.x - this.press.x),
      Math.abs(pointer.y - this.press.y),
    );
    if (drift > PRESS_SLOP_PX) this.cancelPress();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const tap = this.press !== null;
    this.cancelPress();
    // A tap shorter than the long press is an ordinary click, and it acts (D4).
    if (tap) this.handlePress(pointer, false);
  }

  private cancelPress(): void {
    this.pressTimer?.remove(false);
    this.pressTimer = null;
    this.press = null;
  }

  /**
   * Whether the HUD owns this point, and what it does with it. The HUD is not zoomed, so its rectangles
   * are read in screen space. Its pieces are read in the order they cover each other: the countdown of
   * the automatic end of turn and the link under it, the gear and the panel it opens, the action bar
   * against the same rectangle that draws each button (DT-30), the two chips of a pending move, and any
   * point inside any HUD rectangle, even where no control is, so a panel floating over a tile never
   * lets a click through to the tile. Only a point none of them takes reaches the board.
   */
  private hudTakesPress(point: Pixel): boolean {
    // The countdown of the automatic end of turn floats over the board (EA-4), so it is read before
    // anything it covers: the line keeps the turn, and the link under it turns the feature off.
    if (this.autoEndTurn.phase === 'counting') {
      if (containsPoint(COUNTDOWN_LINK_RECT, point)) {
        this.disableAutoEndTurn();
        return true;
      }
      if (containsPoint(COUNTDOWN_RECT, point)) {
        this.applyAutoEndTurn({ type: 'cancel' });
        this.pushHud();
        return true;
      }
    }

    // The gear and the panel it opens are read the way the way out of a finished match is: they are
    // not in `hudRects`, which lists the pieces always on the screen. The panel swallows every click
    // inside it, so nothing under it is pressed while it is open; the gear is what closes it.
    if (containsPoint(SETTINGS_BUTTON_RECT, point)) {
      this.settingsOpen = !this.settingsOpen;
      this.pushHud();
      return true;
    }
    if (this.settingsOpen && containsPoint(SETTINGS_PANEL_RECT, point)) {
      if (containsPoint(SETTINGS_TOGGLE_RECT, point)) this.setAutoEndTurn(!this.autoEndTurn.enabled);
      return true;
    }

    const buttonIndex = buttonIndexAt(point);
    if (buttonIndex !== null) {
      const button = this.buttonModel[buttonIndex];
      if (button !== undefined && button.enabled) this.pressAction(button.id, button.mode);
      return true;
    }

    // The two controls of a pending move float over the board above the bar (EA-5, D6), so they are
    // read before `hudRects` the way the countdown is: what they cover is the board, not the HUD.
    const chipIndex = moveChipIndexAt(point);
    if (chipIndex !== null) {
      const chip = this.chipModel[chipIndex];
      if (chip !== undefined) this.session.send(chip.action);
      return true;
    }

    return hudRects().some((rect) => containsPoint(rect, point));
  }

  /**
   * A press on the board, once the HUD has had its say. The board is zoomed, so the point is read in
   * the world space the pointer reports for the map camera. The gesture decides what it means: the
   * secondary one is an inspection, which reads the unit under the pointer and sends nothing (EA-6),
   * and the primary one is an action, whose meaning `resolveClick` answers and `applyMode` narrows. The
   * server decides the rest.
   */
  private handlePress(pointer: Phaser.Input.Pointer, secondary: boolean): void {
    const point = { x: pointer.x, y: pointer.y };
    const world = { x: pointer.worldX, y: pointer.worldY };

    if (this.finished && containsPoint(RESULT_BUTTON_RECT, point)) {
      this.leave();
      return;
    }
    if (this.finished || this.state === null) return;
    if (this.hudTakesPress(point)) return;

    // The board the state carries says how big it is; what each cell is drawn at comes from the map,
    // lift included, so a click lands on the cell the player aimed at.
    const cell = cellAt(
      world,
      this.state.board,
      (candidate) => this.levelAt(candidate),
      this.lift,
    );
    if (cell === null) return;

    // The secondary gesture asks about the unit on the cell and stops there: it is not a selection and
    // not an action, so it never reaches `resolveClick` and never sends anything (EA-6, D2/D4).
    if (secondary) {
      this.inspect(this.state, cell);
      return;
    }

    // A primary click on the board is an action, so whatever the secondary gesture left on the screen
    // goes away first: the inspection is a question being held, not something the turn carries on with.
    this.closeInspection();

    // The armed mode decides what the click may send: a move only with `Mover` armed, an attack only
    // with `Atacar` armed (EA-7 as amended: the destination is the move, Confirmar commits it).
    const intent = applyMode(
      this.mode,
      resolveClick({ state: this.state, selectedId: this.selectedId, cell, humanTeam: HUMAN_TEAM }),
    );

    switch (intent.kind) {
      case 'select':
        this.selectedId = intent.unitId;
        this.redraw(this.state);
        break;
      case 'send':
        this.session.send(intent.action);
        break;
      case 'inspect':
      case 'none':
        break;
    }
  }

  /**
   * The question the secondary gesture asks: which cells the unit on `cell` covers from where it
   * stands. The answer is the engine's own `attackArea`, drawn alone and in the attack tone; nothing
   * about the match changes, and the acting unit keeps the turn (EA-6, D1/D2). A cell nobody holds, and
   * a unit out of the fight, close the inspection instead — there is nothing to ask about.
   */
  private inspect(state: PublicState, cell: Cell): void {
    const intent = resolveInspect(state, cell);
    this.setInspection(intent.kind === 'inspect' ? intent.unitId : null, state);
  }

  /** The state answers its own question again, which is what the board goes back to (EA-6, D2). */
  private closeInspection(): void {
    // Every click on the board closes the inspection first, so a match with none open must not pay for
    // a redraw that would draw what is already on the screen.
    if (this.inspectedId !== null) this.setInspection(null, this.state);
  }

  /** Opens the inspection on `unitId`, or closes it when that is null, and draws the board again. */
  private setInspection(unitId: string | null, state: PublicState | null): void {
    this.inspectedId = unitId;
    if (state !== null) this.redraw(state);
  }

  /** Arms the button's mode, or cancels it when it is already armed, so the bar is its own undo. */
  private pressAction(id: ActionButton['id'], mode: ActionMode | null): void {
    if (this.finished || this.state === null) return;

    if (mode !== null) {
      this.mode = this.mode === mode ? 'inspect' : mode;
      this.redraw(this.state);
      return;
    }

    const action = immediateAction(id, this.state.round);
    if (action === null) return;

    // The turn is being handed over by hand: the countdown must not hand it over again behind the
    // click, which would put a refused order in the log for the player to wonder about.
    if (action.type === 'endTurn') {
      this.applyAutoEndTurn({ type: 'cancel' });
      this.pushHud();
    }
    this.session.send(action);
  }

  private handleState(message: StateMessage): void {
    if (message.version !== PROTOCOL_VERSION) {
      this.statusText = t('match.versionMismatch');
      this.pushHud();
      return;
    }

    this.state = message.state;
    // The state always comes after the events it caused, so what it says here is where the board
    // ends up — and every event that arrives next is read against it.
    this.snapshot = snapshotOf(message.state);
    this.ensureMap(message.mapId);

    // The acting unit is selected for the player, so the board and the panel are about the unit that
    // can actually act; the mode then falls back if the new turn has nothing left to do.
    const actor = activeSlot(message.state);
    if (actor !== null && isHumanTurn(message.state, HUMAN_TEAM)) this.selectedId = actor.unit.id;
    this.mode = settleMode(this.mode, availableActions(message.state, HUMAN_TEAM));
    this.syncAutoEndTurn();

    this.redraw(message.state);

    if (this.reconnecting) {
      this.reconnecting = false;
      this.statusText = '';
      this.pushHud();
    }
  }

  /**
   * Builds the map the state names, once. A room always plays on the same map, so a different id only
   * happens on a re-join; rebuilding is the cheap correct answer and it costs one comparison per state.
   */
  private ensureMap(mapId: StateMessage['mapId']): void {
    if (this.map !== null && this.map.id === mapId) return;

    this.mapView?.destroy();
    this.map = terrainOf(mapId);
    this.mapView = new MapView(this, this.map);
  }

  /**
   * The height of a cell, as the map the state names has it: the client draws the prototype's own
   * relief rather than a board it is sent cell by cell. A cell with no floor has no height at all.
   */
  private levelAt(cell: Cell): number {
    return this.map?.levelAt(cell) ?? NO_FLOOR;
  }

  /** How far the whole board is lifted off the floor, which only the roof map is. Zero before the map. */
  private get lift(): number {
    return this.map?.lift ?? 0;
  }

  /** Where a unit's feet rest on a cell: the centre of its top face, lifted by the cell's level. */
  private placementOf(cell: Cell): Placement {
    return { cell, anchor: cellToScreen(cell, this.levelAt(cell), this.lift) };
  }

  /**
   * Where an effect is thrown from or lands: the middle of the figure's body, so a shot leaves the
   * body and not the feet. The sky column is the exception — it falls from above onto the tile, so
   * it is aimed at the top face instead.
   */
  private effectPoint(sprite: UnitSprite, onTileTop: boolean): Pixel {
    return { x: sprite.x, y: sprite.y - (onTileTop ? 0 : BODY_HEIGHT / 2) };
  }

  /**
   * Plays the events of one accepted action, then writes them into the log. The snapshot is read
   * for the cues and moved forward after them, so each event is read against the board it found.
   */
  private handleEvents(events: Event[]): void {
    for (const event of events) {
      for (const cue of presentationOf(event, this.snapshot)) this.play(cue);
      this.advanceSnapshot(event);
      this.appendLog(describeEvent(event, UNIT_NAMES));
    }
  }

  private play(cue: Cue): void {
    switch (cue.kind) {
      case 'move':
        this.sprites.get(cue.unitId)?.walkTo(cue.steps.map((step) => this.placementOf(step)));
        break;

      case 'attack': {
        const actor = this.sprites.get(cue.actorId);
        const target = this.sprites.get(cue.targetId);
        if (actor === undefined || target === undefined) break;

        // The effect is thrown from where the two units are drawn, so it reads even mid-move.
        const from = this.effectPoint(actor, false);
        const to = this.effectPoint(target, cue.effect.kind === 'sky-column');
        actor.playAttack(
          { style: cue.style, hit: cue.hit, travelMs: cue.effect.travelMs },
          this.time.now,
          () => playEffect(this, cue.effect, from, to),
        );
        break;
      }

      case 'reload':
        this.sprites.get(cue.unitId)?.playReload(cue.from, cue.to, this.time.now);
        break;

      case 'defeat':
        this.sprites.get(cue.unitId)?.markDefeated();
        break;

      case 'remove':
        this.sprites.get(cue.unitId)?.destroy();
        this.sprites.delete(cue.unitId);
        break;
    }
  }

  /** What an event changes about the board, for the events that follow it in the same batch. */
  private advanceSnapshot(event: Event): void {
    if (event.type === 'moved') {
      const unit = this.snapshot.get(event.actor);
      if (unit !== undefined) this.snapshot.set(event.actor, { ...unit, position: event.to });
      return;
    }

    if (event.type === 'corpse-removed') this.snapshot.delete(event.target);
  }

  /**
   * A refused action changes nothing on the board, and the log says why. A refused `endTurn` also
   * hands the turn back to the player (DT-75): the countdown is over, so the hint takes its place.
   */
  private handleRejected(reason: RejectReason): void {
    this.appendLog(describeRejection(reason));
    this.applyAutoEndTurn({ type: 'rejected' });
    this.pushHud();
  }

  /** A rejected action changes nothing: the state, the selection and the armed mode stay as they were. */
  private appendLog(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > LOG_LINES) {
      this.logLines.splice(0, this.logLines.length - LOG_LINES);
    }
    this.pushHud();
  }

  private async handleDrop(): Promise<void> {
    if (this.finished) return;

    this.reconnecting = true;
    this.statusText = t('match.reconnecting');
    this.pushHud();

    // The server sends the state again once the seat is back, which clears the notice.
    if (await this.session.reconnect()) return;

    this.reconnecting = false;
    this.finish();
    this.statusText = t('match.lost');
    this.pushHud();
  }

  /** The match is over: clicks stop, the countdown stops with them, and the way out appears. */
  private finish(): void {
    this.finished = true;
    this.syncAutoEndTurn();
    this.pushHud();
  }

  /**
   * Tells the machine what the turn has left (EA-4). `availableActions` answers with the engine's own
   * `canStillAct`, so the countdown starts exactly when the server would have nothing left to accept,
   * and the bot's turn is never counted: what the bot has left is the bot's business.
   *
   * The unit on turn is remembered, because a hand-over starts from nothing: a countdown that ran out
   * on the last unit must not leave the next one already sent, and a cancel belongs to the turn it was
   * made on.
   */
  private syncAutoEndTurn(): void {
    const state = this.finished ? null : this.state;
    const actor = state === null ? null : (activeSlot(state)?.unit.id ?? null);

    if (actor !== this.autoEndTurnUnit) {
      this.autoEndTurnUnit = actor;
      this.applyAutoEndTurn({ type: 'nothingLeftOff' });
    }

    const nothingLeft = state !== null && availableActions(state, HUMAN_TEAM).nothingLeft;
    if (nothingLeft !== this.autoEndTurn.nothingLeft) {
      this.applyAutoEndTurn({ type: nothingLeft ? 'nothingLeftOn' : 'nothingLeftOff' });
    }
  }

  /**
   * One frame of the countdown. The machine is handed the milliseconds since the last frame, so it
   * never reads the clock itself, and the turn goes out with the round the state is on: a command that
   * reaches the server after the match has moved on is refused instead of ending somebody's turn.
   */
  private advanceAutoEndTurn(time: number): void {
    const elapsedMs = this.lastFrameMs === 0 ? 0 : time - this.lastFrameMs;
    this.lastFrameMs = time;

    const state = this.state;
    if (state === null || elapsedMs <= 0) return;

    const before = this.autoEndTurn;
    const step = this.applyAutoEndTurn({ type: 'tick', ms: elapsedMs });
    if (step.send) this.session.send(endTurnAction(state));

    // The countdown is read a whole second at a time, so a frame that leaves the second where it was
    // redraws nothing; the phase has to change with it, which is also what takes the line off the
    // screen once the turn has gone out — reaching zero is a change of phase like any other.
    const changed = step.machine.phase !== before.phase || secondsLeft(before) !== secondsLeft(step.machine);
    if (changed) this.pushHud();
  }

  /** Feeds the machine one event and keeps its answer. Only the countdown acts on `send`. */
  private applyAutoEndTurn(event: AutoEndTurnEvent): AutoEndStep {
    const step = stepAutoEndTurn(this.autoEndTurn, event);
    this.autoEndTurn = step.machine;
    return step;
  }

  /** Turns the automatic end of turn off for good, from the link under the countdown (EA-4). */
  private disableAutoEndTurn(): void {
    saveAutoEndTurn(false);
    this.applyAutoEndTurn({ type: 'disable' });
    this.pushHud();
  }

  /** The one option of the settings panel, which turns the feature both on and off. */
  private setAutoEndTurn(enabled: boolean): void {
    saveAutoEndTurn(enabled);
    this.applyAutoEndTurn({ type: 'settingChanged', enabled });
    this.pushHud();
  }

  /**
   * Back to the title. The session is closed first, so the room does not report the exit as a drop,
   * and then the game goes: the canvas and the scenes are the match, and the title is a page of its
   * own, so there is nothing left of the match to hand over. Phaser destroys the game on the next
   * frame, which is what makes this safe from inside a click; `main.ts` hears the `DESTROY` and gives
   * the screen back to the title.
   */
  private leave(): void {
    this.session.close();
    this.game.destroy(true);
  }

  private handleEnded(message: EndedMessage): void {
    this.finish();
    this.reconnecting = false;
    this.mode = 'inspect';
    this.selectedId = null;
    this.statusText = '';
    this.resultText = t(message.winner === HUMAN_TEAM ? 'match.victory' : 'match.defeat');
    this.pushHud();
  }

  private redraw(state: PublicState): void {
    this.drawHighlights(state);
    this.redrawUnits(state);
    this.pushHud();
  }

  /** Hands the HUD what it shows now, and keeps the model of its buttons for the clicks. */
  private pushHud(): void {
    this.buttonModel = this.state ? actionButtons(this.state, HUMAN_TEAM) : [];
    this.chipModel = this.state ? moveChips(this.state, HUMAN_TEAM) : [];
    this.hud.render({
      state: this.state,
      humanTeam: HUMAN_TEAM,
      selectedId: this.selectedId,
      mode: this.mode,
      finished: this.finished,
      buttons: this.buttonModel,
      moveChips: this.chipModel,
      logLines: this.logLines,
      status: this.statusText,
      result: this.resultText,
      wayOutVisible: this.finished,
      settingsOpen: this.settingsOpen,
      autoEndTurn: {
        phase: this.autoEndTurn.phase,
        seconds: secondsLeft(this.autoEndTurn),
        enabled: this.autoEndTurn.enabled,
      },
    });
  }

  /** Zooms the map about a point of the screen. The HUD is not in the map camera, so it stays put. */
  private zoomBy(factor: number, screen: Pixel): void {
    if (this.state === null) return;

    const canvas = { width: this.scale.width, height: this.scale.height };
    const bounds = boardBounds(this.state.board, (cell) => this.levelAt(cell), this.lift);
    this.camera = zoomAbout(this.camera, screen, { x: canvas.width / 2, y: canvas.height / 2 }, factor, bounds, canvas);
    this.applyCamera();
  }

  /** Puts the map camera where the view says. Before the board is known there is nothing to clamp to. */
  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(this.camera.zoom);
    cam.centerOn(this.camera.centre.x, this.camera.centre.y);
  }

  /**
   * The cells the state offers, drawn as the top face of each cell they cover. There is one area at a
   * time and which one it is comes from the state, not from the armed mode (EA-5): the destinations
   * while choosing where to walk, and the area the unit covers from where it stands once a move is
   * waiting to be confirmed. An inspection (EA-6) replaces that question with the reach of the unit the
   * player is asking about, drawn alone. The tone follows the same answer, so the two never mix.
   */
  private drawHighlights(state: PublicState): void {
    for (const graphic of this.highlights) graphic.destroy();
    this.highlights = [];

    const move = highlightTone({ mode: this.mode, inspectedId: this.inspectedId }) === 'move';
    const color = move ? HIGHLIGHT_MOVE_COLOR : HIGHLIGHT_ATTACK_COLOR;
    const alpha = move ? HIGHLIGHT_MOVE_ALPHA : HIGHLIGHT_ATTACK_ALPHA;
    const cells = highlightedCells({
      state,
      selectedId: this.selectedId,
      inspectedId: this.inspectedId,
      mode: this.mode,
      humanTeam: HUMAN_TEAM,
    });

    for (const cell of cells) {
      const level = this.levelAt(cell);
      // A gap has no top face to wash: nothing is aimed at it and no rule ever offers it.
      if (level === NO_FLOOR) continue;

      const graphic = this.add.graphics().setDepth(LAYER.highlight(cell));
      const face = topFace(cell, level, this.lift);

      graphic.fillStyle(color, alpha);
      graphic.fillPoints(face, true);
      graphic.lineStyle(2, color, 1);
      graphic.strokePoints(face, true, true);
      this.highlights.push(graphic);
    }
  }

  /**
   * Brings the sprites in line with the state. A sprite is created once and then only synced, so an
   * animation that is playing is never thrown away by a redraw that arrives in the middle of it.
   */
  private redrawUnits(state: PublicState): void {
    const inPlay = new Set<string>();
    const activeId = activeSlot(state)?.unit.id ?? null;

    for (const unit of state.units) {
      if (unit.permanentlyDead) continue;
      inPlay.add(unit.id);

      const marks = { selected: unit.id === this.selectedId, active: unit.id === activeId };
      let sprite = this.sprites.get(unit.id);
      if (sprite === undefined) {
        sprite = new UnitSprite(this, unit, marks, this.placementOf(unit.position));
        this.sprites.set(unit.id, sprite);
      } else {
        sprite.sync(unit, marks, this.placementOf(unit.position));
      }
    }

    for (const id of [...this.sprites.keys()]) {
      if (inPlay.has(id)) continue;
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
    }
  }

  /** One frame of every animation on the board, and one of the countdown. The sprites advance. */
  update(time: number): void {
    this.mapView?.update(time);
    for (const sprite of this.sprites.values()) sprite.tick(time);
    this.advanceAutoEndTurn(time);
  }

}
