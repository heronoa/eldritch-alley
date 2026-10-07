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
import {
  PAN_SENSITIVITY_DEFAULT,
  PAN_SENSITIVITY_MAX,
  PAN_SENSITIVITY_MIN,
  panFactor,
  readPanSensitivity,
  savePanSensitivity,
  stepPanSensitivity,
} from '../game/panSensitivity';
import { coverSentence } from '../game/coverBadge';
import { readHighlightCovers, saveHighlightCovers } from '../game/highlightCovers';
import { buildEnv, highlightCoversDefault } from '../config';
import { HIT_MARGIN_PX, unitAtPoint, type SpriteLayout } from '../game/hit';
import { highlightedCells, highlightTone } from '../game/highlight';
import { describeEvent, describeRejection, type Battlefield, type UnitNames } from '../game/log';
import { presentationOf, type Cue, type Snapshot } from '../game/presentation';
import { Gestures, LONG_PRESS_MS, type Pinch, type PressPointer } from '../game/press';
import { resolveClick, resolveInspect } from '../game/selection';
import { activeSlot, isHumanTurn, turnOrder } from '../game/turn-order';
import { t } from '../i18n';
import { terrainOf, type Terrain } from '../maps/terrain';
import { Session } from '../net/session';
import {
  PROTOCOL_VERSION,
  type BoardState,
  type ClientAction,
  type EndedMessage,
  type Event,
  type PublicState,
  type RejectReason,
  type StateMessage,
  type Team,
  type UnitState,
} from '../protocol';
import { NO_FLOOR, type Cell, type Pixel } from '../view/grid';
// The camera itself is still described in `view/camera.ts`; what it does now comes from the pure maths
// of EA-12, which the scene reads and never works out for itself.
import { type CameraView } from '../view/camera';
import { MIN_ZOOM, clampPan, snapZoom, zoomAround } from '../view/camera-math';
import { facesRight, type BillboardUnit } from '../view/billboard';
import { VIEWS, rotateCell, unrotateCell, viewDirection } from '../view/rotation';
import { rotationProgress, simplifiedAt } from '../view/rotation-animation';
import { LAYER } from '../view/depth';
import { covers, type Drawn } from '../view/cutaway';
import { HZ, TILE_H, TILE_W, cellAt, cellToScreen, depthOfCell, topFace } from '../view/iso';
import {
  LOG_LINES,
  LOG_TOGGLE_RECT,
  buttonIndexAt,
  COUNTDOWN_LINK_RECT,
  COUNTDOWN_RECT,
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  RESULT_BUTTON_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_COVERS_ROW_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_PAN_MINUS_RECT,
  SETTINGS_PAN_PLUS_RECT,
  SETTINGS_TOGGLE_RECT,
  CAMERA_RECT,
  cameraControlAt,
  carouselSlotIndexAt,
  containsPoint,
  hudRects,
  logRect,
  moveChipIndexAt,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  boardBounds,
  type CameraControl,
  type Rect,
} from '../view/layout';
import {
  HIGHLIGHT_ATTACK_ALPHA,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_ALPHA,
  HIGHLIGHT_MOVE_COLOR,
} from '../view/theme';
import { BODY_HEIGHT, SPRITE_SIZE } from '../view/unit-look';
import { playEffect } from './effects';
import { MapView } from './map/MapView';
import { boardMarks } from './map/marks';
import { RotationView } from './map/RotationView';
import { drawnLevel, letterOf } from './map/cell';
import { HudScene } from './HudScene';
import { UnitSprite, type Placement } from './units';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';

/**
 * What this build starts with for the marks of the rules, before the player's own choice is read
 * (EA-15). Resolved once, at load: a build that declares a value the client cannot read fails here
 * rather than quietly drawing the wrong default (config D4).
 */
const HIGHLIGHT_COVERS_BUILD_DEFAULT = highlightCoversDefault(buildEnv());

/** How far an arrow key, or one of WASD, slides the map, in canvas pixels. */
const PAN_KEY_PX = 80;

/** Which way each key slides the camera over the map, in canvas pixels. */
const KEY_PAN: Record<string, Pixel> = {
  arrowright: { x: PAN_KEY_PX, y: 0 },
  d: { x: PAN_KEY_PX, y: 0 },
  arrowleft: { x: -PAN_KEY_PX, y: 0 },
  a: { x: -PAN_KEY_PX, y: 0 },
  arrowdown: { x: 0, y: PAN_KEY_PX },
  s: { x: 0, y: PAN_KEY_PX },
  arrowup: { x: 0, y: -PAN_KEY_PX },
  w: { x: 0, y: -PAN_KEY_PX },
};

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

/**
 * A turn of the view while it is happening (EA-12, slice 3): the map being turned away from, the way
 * round the map goes, when the turn began, and the simplified drawing that carries it.
 */
interface Turn {
  readonly from: Terrain;
  readonly steps: number;
  readonly startedAt: number;
  readonly view: RotationView;
}

export class MatchScene extends Phaser.Scene {
  private session!: Session;
  private state: PublicState | null = null;
  private selectedId: string | null = null;
  /** The armed mode. `move` and `attack` narrow the next board click; `inspect` leaves it alone. */
  private mode: ActionMode = 'inspect';
  /** The unit the secondary gesture is inspecting, or null when no inspection is open (EA-6). */
  private inspectedId: string | null = null;
  /** The timer of the long press, which the rules of `game/press.ts` decide when to arm (EA-6, D4). */
  private pressTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * The gestures of the match, by their own rules (DT-79, DT-84): the fingers that are down, the press
   * waiting on its own lift and the drag the map follows. The scene asks it what a pointer event means
   * and does that; nothing of the rule itself is written down here.
   */
  private readonly gestures = new Gestures();
  /** The pinch in progress: how far apart the two fingers started, and the zoom at that moment. */
  private pinchFrom = 0;
  private pinchZoom = MIN_ZOOM;
  /** Which of the four views the map is drawn from (EA-12). */
  private viewSteps = 0;
  /** The turn in progress, or null while the view stands still (EA-12, slice 3). */
  private turn: Turn | null = null;
  private logLines: string[] = [];
  /** Whether the log is showing every line it keeps, or only its header and the last one (Q3). */
  private logOpen = false;
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
  /** How much of a finger's travel drags the map, as a percentage of it (owner's request). */
  private panSensitivity: number = PAN_SENSITIVITY_DEFAULT;
  /** Whether the board draws the marks of the rules, as the settings checkbox has it (EA-15). */
  private highlightCovers: boolean = HIGHLIGHT_COVERS_BUILD_DEFAULT;
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
    this.disarmLongPress();
    this.gestures.cancel();
    this.pinchFrom = 0;
    this.pinchZoom = MIN_ZOOM;
    // Switching maps resets the view to N, so a match never opens from a side the last one was left on.
    this.viewSteps = 0;
    this.turn = null;
    this.logLines = [];
    this.logOpen = false;
    this.finished = false;
    this.reconnecting = false;
    // The setting is read again on every match: another tab may have changed it since the last one.
    this.autoEndTurn = initialAutoEndTurn(readAutoEndTurn());
    this.autoEndTurnUnit = null;
    this.settingsOpen = false;
    // The same reason as the setting above: the drag the player last chose may have been chosen
    // elsewhere, and every match opens on it.
    this.panSensitivity = readPanSensitivity();
    // And the marks of the rules: the player's own choice where there is one, the build's default
    // where there is none (EA-15).
    this.highlightCovers = readHighlightCovers(HIGHLIGHT_COVERS_BUILD_DEFAULT);
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

    // A second pointer, so two fingers are reported at once and a pinch is possible at all (EA-12).
    this.input.addPointer(1);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    // The right button is the inspection on a desktop, so the menu of the browser must not eat it.
    this.input.mouse?.disableContextMenu();
    // Phaser has no event for a pointer the browser takes away: it is read straight off the canvas,
    // because a finger lost mid-gesture — a call, a system gesture — must not leave the map stuck.
    this.game.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.stepZoom(dy < 0 ? 1 : -1, { x: pointer.x, y: pointer.y });
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const centre = { x: this.scale.width / 2, y: this.scale.height / 2 };
      if (event.key === '+' || event.key === '=') this.stepZoom(1, centre);
      if (event.key === '-' || event.key === '_') this.stepZoom(-1, centre);
      const pan = KEY_PAN[event.key.toLowerCase()];
      if (pan !== undefined) this.moveCameraBy(pan.x, pan.y);
      // Q and E turn the view, the two keys either side of W A S D: the same pair the panel's two
      // arrows are, for a desktop with no pinch and no room for a panel (EA-12).
      if (event.key.toLowerCase() === 'q') this.rotateView(-1);
      if (event.key.toLowerCase() === 'e') this.rotateView(1);
    });

    // The map's canvases are textures of the game, not objects of this scene: leaving without taking
    // them out would pile a hundred of them up on the next match.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.disarmLongPress();
      this.gestures.cancel();
      this.game.canvas.removeEventListener('pointercancel', this.onPointerCancel);
      this.turn?.view.destroy();
      this.turn = null;
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
   * A pointer goes down. The rules of what that means are `game/press.ts`; the scene only does what
   * they answer: an inspection read at once, a press that waits, or the beginning of a pinch.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const outcome = this.gestures.down(pressPointer(pointer));
    if (!this.gestures.waiting()) this.disarmLongPress();

    switch (outcome.kind) {
      case 'inspect':
        this.handlePress(pointer, true);
        return;
      case 'begin':
        if (outcome.longPress) this.armLongPress(pointer);
        return;
      case 'pinchBegin':
        this.pinchFrom = outcome.pinch.distance;
        this.pinchZoom = this.camera.zoom;
        return;
      default:
        return;
    }
  }

  /**
   * A finger that rests long enough on a unit is inspecting it, not tapping the board (D4). Only a
   * finger ever gets here: a mouse button is a click, and the long press is the touch answer to hover.
   */
  private armLongPress(pointer: Phaser.Input.Pointer): void {
    this.disarmLongPress();
    this.pressTimer = this.time.delayedCall(LONG_PRESS_MS, () => {
      // The timer is spent, and taking the press down here is what keeps the release that follows from
      // clicking as well: one gesture, one meaning (D4).
      this.pressTimer = null;
      if (this.gestures.longPress().kind === 'inspect') this.handlePress(pointer, true);
    });
  }

  private disarmLongPress(): void {
    this.pressTimer?.remove(false);
    this.pressTimer = null;
  }

  /**
   * A pointer moves. Two of them pinch the map; one of them drags it, and the drag begins only once the
   * gesture is no longer a tap — which is also when the press waiting under it is taken down, so a
   * click never nudges the map and panning never picks a cell by accident (EA-12).
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const outcome = this.gestures.move(pressPointer(pointer));
    if (!this.gestures.waiting()) this.disarmLongPress();

    if (outcome.kind === 'pinch') this.pinchTo(outcome.pinch);
    else if (outcome.kind === 'pan') {
      // The one place the drag sensitivity is read: the travel is the whole of it from where the finger
      // went down, so scaling it scales the gesture and never accumulates. The keys call the camera
      // directly and keep the step they have always had (owner's decision).
      const factor = panFactor(this.panSensitivity);
      this.moveCameraBy(outcome.by.x * factor, outcome.by.y * factor);
    }
  }

  /**
   * A pointer lifts, or the browser takes it away. Lifting one finger of a pinch ends the pinch, and the
   * zoom settles onto a whole step. A gesture that stayed a tap is an ordinary click, and it acts; one
   * that travelled was panning the map, and it does nothing else (D4, EA-12).
   */
  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const outcome = this.gestures.up(pressPointer(pointer));
    this.disarmLongPress();
    this.endPinch();

    if (outcome.kind === 'tap') this.handlePress(pointer, false);
  }

  /**
   * The browser took a pointer away — a call, a system gesture — and Phaser never says so. Every
   * gesture it was part of ends here, so nothing is left waiting for a lift that will not come.
   */
  private onPointerCancel = (): void => {
    this.gestures.cancel();
    this.disarmLongPress();
    this.endPinch();
  };

  /** Two fingers move: the zoom follows how far apart they are, about the point between them. */
  private pinchTo(pinch: Pinch): void {
    if (this.state === null || this.pinchFrom <= 0) return;

    const zoom = (this.pinchZoom * pinch.distance) / this.pinchFrom;

    this.camera = zoomAround(this.camera, pinch.focal, zoom, this.bounds(), this.canvasSize());
    this.applyCamera();
  }

  /** The pinch is over, so the zoom settles onto a whole step and the next drag starts from nothing. */
  private endPinch(): void {
    if (this.pinchFrom === 0) return;
    this.pinchFrom = 0;
    this.snapToWholeStep();
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
    // The inspection window floats over the board and over every panel of the HUD, so it is read
    // first: the X closes it, and a press anywhere else inside it is the window's own and reaches
    // nothing under it. Nothing else closes it — a press on the board acts as it always does and
    // leaves the window standing (Q4 of the smoke test 2 feedback).
    if (this.inspectedId !== null && containsPoint(INSPECT_RECT, point)) {
      if (containsPoint(INSPECT_CLOSE_RECT, point)) this.closeInspection();
      return true;
    }

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
    // inside it, so nothing under it is pressed while it is open; the gear is what closes it. Its two
    // rows are read inside that guard, so the title and the gaps between the controls are the panel's
    // too, and only the controls themselves do anything.
    if (containsPoint(SETTINGS_BUTTON_RECT, point)) {
      this.settingsOpen = !this.settingsOpen;
      this.pushHud();
      return true;
    }
    if (this.settingsOpen && containsPoint(SETTINGS_PANEL_RECT, point)) {
      if (containsPoint(SETTINGS_TOGGLE_RECT, point)) this.setAutoEndTurn(!this.autoEndTurn.enabled);
      else if (containsPoint(SETTINGS_PAN_MINUS_RECT, point)) this.pressPanStepper(-1);
      else if (containsPoint(SETTINGS_PAN_PLUS_RECT, point)) this.pressPanStepper(1);
      else if (containsPoint(SETTINGS_COVERS_ROW_RECT, point)) this.setHighlightCovers(!this.highlightCovers);
      return true;
    }

    // The log is not in `hudRects` either, because it is as tall as it is open (Q3): its own box is
    // read here, so the header that toggles it and the band its line occupies reach no tile under it.
    // The header is read first and is in the same place either way, so the toggle is always the press
    // the player has learnt.
    if (containsPoint(logRect(this.logOpen), point)) {
      if (containsPoint(LOG_TOGGLE_RECT, point)) {
        this.logOpen = !this.logOpen;
        this.pushHud();
      }
      return true;
    }

    const buttonIndex = buttonIndexAt(point);
    if (buttonIndex !== null) {
      const button = this.buttonModel[buttonIndex];
      if (button !== undefined && button.enabled) this.pressAction(button.id, button.mode);
      return true;
    }

    // The camera panel floats over the board against the right edge (EA-12), so it is read before
    // `hudRects` the way the countdown is: what it covers is the board, not the HUD. Every press it
    // covers belongs to the panel, its controls and the gaps between them alike.
    if (containsPoint(CAMERA_RECT, point)) {
      const control = cameraControlAt(point);
      if (control !== null) this.pressCamera(control);
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

    const state = this.state;

    // The turn queue floats over the board and is drawn above it, so a portrait is read before the
    // board is: pressing one is pressing the unit the slot shows, and the rest of the press is the
    // press on that unit's own cell (EA-8). The gaps between the portraits stay the HUD's, as they
    // always were, and `hudTakesPress` swallows them.
    const portrait = this.portraitAt(state, point);
    if (portrait !== null) {
      this.pressOnCell(state, portrait.position, secondary, portrait);
      return;
    }

    if (this.hudTakesPress(point)) return;

    // The figure of a unit stands over the cells behind the one its feet rest on, so a press that
    // covers one names its unit: the target is the unit the player sees, not the cell the finger
    // happens to cover (EA-8). Only a press that covers no figure is read against the cell under it,
    // which is what walking onto free ground needs.
    //
    // The figures are read where they are drawn — in the view — so both the anchor and the order two
    // figures covering one point are drawn in are the view's own (EA-12). The cell is then read back
    // through the rotation, because the state knows only the map's own coordinates.
    const hit = unitAtPoint(this.inView(state.units), world, this.spriteLayout);
    const view =
      hit?.position ??
      cellAt(world, this.map?.size ?? state.board, (candidate) => this.levelAt(candidate), this.lift);
    if (view === null) return;

    this.pressOnCell(state, this.mapCell(view), secondary, hit);
  }

  /** The units of the state as the view sees them: the cells they stand on turned to face the camera. */
  private inView(units: readonly UnitState[]): UnitState[] {
    return units.map((unit) => ({ ...unit, position: this.viewCell(unit.position) }));
  }

  /**
   * The unit whose portrait of the turn queue sits under a point, or null when the point is on none
   * of them. The slots are drawn in turn order, which is the order the queue is read in (EA-8).
   */
  private portraitAt(state: PublicState, point: Pixel): UnitState | null {
    const queue = turnOrder(state);
    const index = carouselSlotIndexAt(point, queue.length);

    return index === null ? null : (queue[index]?.unit ?? null);
  }

  /**
   * A press that named a unit and a cell: the figure standing on the board (EA-8), or a portrait of
   * the turn queue that shows the same unit. A press that named no unit is the empty cell under the
   * finger. The secondary gesture asks about the cell, the primary one acts on what was named.
   *
   * A press on a figure is handed the cell the unit stands on, because that is the cell its target
   * is: the figure covers the cells behind it, and those are not where the unit or its reach is.
   */
  private pressOnCell(
    state: PublicState,
    cell: Cell,
    secondary: boolean,
    named: UnitState | null = null,
  ): void {
    // A turn of the view is a quarter turn on its way: until it arrives, the board on the screen is the
    // one being drawn away from, and the map underneath is already read through the view the turn is
    // heading for. A press read here would name a cell of neither, so no board press is taken while the
    // view swings (DT-86). The HUD is unaffected: it is hit-tested before the board is reached.
    if (this.turn !== null) return;

    // The secondary gesture asks about the unit on the cell and stops there: it is not a selection and
    // not an action, so it never reaches `resolveClick` and never sends anything (EA-6, D2/D4).
    if (secondary) {
      this.inspect(state, cell);
      return;
    }

    // A primary click on the board is an action, and the inspection it may have opened stays where it
    // is: the sheet closes by its own X and by nothing else (Q4 of the smoke test 2 feedback), so the
    // highlight it put on the board stays until the player closes it.

    // The armed mode decides what the click may send: a move only with `Mover` armed, an attack only
    // with `Atacar` armed (EA-7 as amended: the destination is the move, Confirmar commits it).
    const intent = applyMode(
      this.mode,
      resolveClick({
        state,
        selectedId: this.selectedId,
        cell,
        targetId: named?.id ?? null,
        humanTeam: HUMAN_TEAM,
      }),
    );

    switch (intent.kind) {
      case 'select':
        this.selectedId = intent.unitId;
        this.redraw(state);
        break;
      case 'send':
        this.session.send(intent.action);
        break;
      case 'refused':
        // The turn can use no target there, and nothing is sent: the log says which rule turned the
        // press down, in the engine's own words (EA-8).
        this.appendLog(describeRejection(intent.reason));
        break;
      case 'inspect':
      case 'none':
        break;
    }
  }

  /**
   * The board as the hit test of a press reads it: where the feet of a unit are drawn, and how far
   * outside its figure a press still counts. The units the hit test is handed are the view's own, so
   * the anchor is read from the cell as it is given and never turned twice (EA-12). The margin is in
   * screen pixels, so it is divided by the zoom: a thumb covers the same part of a sprite whatever the
   * board is scaled to (EA-8, D1).
   */
  private get spriteLayout(): SpriteLayout {
    return {
      anchorOf: (unit) => this.feetOf(unit.position),
      margin: HIT_MARGIN_PX / this.camera.zoom,
    };
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
    this.ensureMap(message.mapId, message.state.board);

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
  private ensureMap(mapId: StateMessage['mapId'], board: BoardState): void {
    if (this.map !== null && this.map.id === mapId) return;

    this.buildMap(mapId, board);
  }

  /**
   * Builds the detailed map of a view, and puts the marks of the board on it. Both the first build and
   * the one every turn of the camera asks for come through here, so a view built again never loses the
   * marks nor the player's setting for them. A null board is a match whose first state has not arrived:
   * the map is built with nothing marked.
   */
  private buildMap(mapId: StateMessage['mapId'], board: BoardState | null): void {
    this.mapView?.destroy();
    this.map = terrainOf(mapId, this.viewSteps);
    this.mapView = new MapView(this, this.map, board === null ? [] : boardMarks(board));
    this.mapView.setMarksVisible(this.highlightCovers);
  }

  /**
   * Starts a turn of the view a quarter to the left or to the right (EA-12). The map itself is never
   * changed: it is read again from the side the view looks from, which is what makes every drawing
   * that asks the map about its neighbours — the kerbs, the parapets, the fences, the road markings,
   * the stripes of the crosswalk — answer in the new view.
   *
   * The reading happens at the end of the turn, not here: while the view swings, the simplified
   * drawing of `RotationView` carries it, and a second turn asked for in the middle of one is refused
   * — there is no view to turn away from until this one arrives.
   */
  private rotateView(steps: number): void {
    if (this.map === null || this.turn !== null) return;

    const from = this.map;
    this.turn = {
      from,
      steps,
      startedAt: this.time.now,
      view: new RotationView(this, from, this.billboards(), steps * (360 / VIEWS)),
    };
  }

  /**
   * The units as the view being turned away from sees them: the billboards the turn carries. A unit
   * whose body has left the map is left out, exactly as its sprite is.
   */
  private billboards(): BillboardUnit[] {
    if (this.state === null) return [];

    return this.state.units
      .filter((unit) => !unit.permanentlyDead)
      .map((unit) => ({
        team: unit.team,
        position: this.viewCell(unit.position),
        permanentlyDead: unit.permanentlyDead,
        primaryClass: unit.primaryClass,
      }));
  }

  /**
   * The turn is over: the detailed map of the view it arrived at takes the place of the simplified
   * one, and everything that was placed in the old view is placed again in the new.
   */
  private settleTurn(turn: Turn): void {
    turn.view.destroy();
    this.turn = null;

    this.viewSteps += turn.steps;
    // The marks belong to the board, not to the view, so the map of the new view carries them as the
    // one it replaces did.
    this.buildMap(turn.from.id, this.state?.board ?? null);
    if (this.state !== null) this.redraw(this.state);
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

  /** Where a unit's feet rest on a cell of the view: the centre of its top face, lifted by its level. */
  private feetOf(view: Cell): Pixel {
    return cellToScreen(view, this.levelAt(view), this.lift);
  }

  /** Where a unit of the state stands in the view: its cell turned, and the point its feet rest on. */
  private placementOf(cell: Cell): Placement {
    const view = this.viewCell(cell);
    return { cell: view, anchor: this.feetOf(view) };
  }

  /**
   * The cell of the view a cell of the map is drawn at. Everything the server sends is stated in the
   * map's own coordinates, and the view is the only thing the rotation moves: the state is read through
   * this on the way to the screen, and through `mapCell` on the way back (EA-12).
   */
  private viewCell(cell: Cell): Cell {
    return this.map === null ? cell : rotateCell(cell, this.viewSteps, this.map.mapSize);
  }

  /** The cell of the map a cell of the view names: what a tap on the canvas has to answer. */
  private mapCell(cell: Cell): Cell {
    return this.map === null ? cell : unrotateCell(cell, this.viewSteps, this.map.size);
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
   * for the cues and moved forward after them, so each event is read against the board it found —
   * and that is also what the log is handed, because a shot says where both ends stood (EA-15).
   */
  private handleEvents(events: Event[]): void {
    for (const event of events) {
      for (const cue of presentationOf(event, this.snapshot)) this.play(cue);
      this.appendLog(describeEvent(event, UNIT_NAMES, this.battlefield()));
      this.advanceSnapshot(event);
    }
  }

  /**
   * The board and the positions the events are read against, as `describeEvent` takes them. The shots
   * that arrive before the first state have no board to be read on, and the log says nothing of cover
   * then (the server sends the state before the events of an action, so this is the first action only).
   */
  private battlefield(): Battlefield | undefined {
    if (this.state === null) return undefined;

    return {
      board: this.state.board,
      positions: Object.fromEntries([...this.snapshot].map(([id, unit]) => [id, unit.position])),
    };
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

  /** The first option of the settings panel, which turns the feature both on and off. */
  private setAutoEndTurn(enabled: boolean): void {
    saveAutoEndTurn(enabled);
    this.applyAutoEndTurn({ type: 'settingChanged', enabled });
    this.pushHud();
  }

  /**
   * The second option: one press of the stepper. At either end the step lands where it already is, so
   * a press there is harmless — the panel greys the sign out, and the value is saved and shown again.
   */
  private pressPanStepper(direction: 1 | -1): void {
    this.panSensitivity = stepPanSensitivity(this.panSensitivity, direction);
    savePanSensitivity(this.panSensitivity);
    this.pushHud();
  }

  /**
   * The third option: the marks of the rules (EA-15). The choice is the player's and outlives the page,
   * so it is saved here; the map is told at once, because hiding them repaints nothing.
   */
  private setHighlightCovers(enabled: boolean): void {
    this.highlightCovers = enabled;
    saveHighlightCovers(enabled);
    this.mapView?.setMarksVisible(enabled);
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
    this.drawCoveredBuildings(state);
    this.pushHud();
  }

  /**
   * The buildings the player cannot see past, drawn translucent so what they hide shows through: the
   * ones standing over a unit's figure (EA-12, slice 4). Only the view is touched — for the rules the
   * building is whole — and a building the view has already cut down is left solid, because there is
   * nothing left behind it to hide.
   *
   * The cell under the pointer is not among them yet: the client has no hover to read one from.
   */
  private drawCoveredBuildings(state: PublicState): void {
    const { map, mapView } = this;
    if (map === null || mapView === null) return;

    const figures: Drawn[] = state.units
      .filter((unit) => !unit.permanentlyDead)
      .map((unit) => {
        const view = this.viewCell(unit.position);
        const { anchor } = this.placementOf(unit.position);

        return {
          box: {
            x: anchor.x - SPRITE_SIZE.width / 2,
            y: anchor.y - SPRITE_SIZE.height,
            width: SPRITE_SIZE.width,
            height: SPRITE_SIZE.height,
          },
          depth: depthOfCell(view),
        };
      });

    const covered: Cell[] = [];
    for (let y = 0; y < map.size.height; y += 1) {
      for (let x = 0; x < map.size.width; x += 1) {
        const cell = { x, y };
        if (letterOf(map, cell) !== 'B') continue;
        if (drawnLevel(map, cell) < this.levelAt(cell)) continue;

        const level = this.levelAt(cell);
        const centre = cellToScreen(cell, level, this.lift);
        const column: Drawn = {
          box: {
            x: centre.x - TILE_W / 2,
            y: centre.y - TILE_H / 2,
            width: TILE_W,
            height: TILE_H + (level + 1) * HZ,
          },
          depth: depthOfCell(cell),
        };

        if (figures.some((figure) => covers(column, figure))) covered.push(cell);
      }
    }

    mapView.setCovered(covered);
  }

  /** Hands the HUD what it shows now, and keeps the model of its buttons for the clicks. */
  private pushHud(): void {
    this.buttonModel = this.state ? actionButtons(this.state, HUMAN_TEAM) : [];
    this.chipModel = this.state ? moveChips(this.state, HUMAN_TEAM) : [];
    this.hud.render({
      state: this.state,
      humanTeam: HUMAN_TEAM,
      selectedId: this.selectedId,
      inspectedId: this.inspectedId,
      mode: this.mode,
      finished: this.finished,
      buttons: this.buttonModel,
      moveChips: this.chipModel,
      logLines: this.logLines,
      logOpen: this.logOpen,
      status: this.statusText,
      result: this.resultText,
      wayOutVisible: this.finished,
      settingsOpen: this.settingsOpen,
      // Whether the board draws the marks of the rules (EA-15). The setting lives here; the HUD only
      // draws the tick of its checkbox.
      highlightCovers: this.highlightCovers,
      // Which ends of the stepper still do something is decided here, where the setting lives, and only
      // drawn by the HUD — the same way the setting of the automatic end of turn is.
      panSensitivity: {
        percent: this.panSensitivity,
        canDecrease: this.panSensitivity > PAN_SENSITIVITY_MIN,
        canIncrease: this.panSensitivity < PAN_SENSITIVITY_MAX,
      },
      camera: { view: viewDirection(this.viewSteps), zoom: snapZoom(this.camera.zoom) },
      autoEndTurn: {
        phase: this.autoEndTurn.phase,
        seconds: secondsLeft(this.autoEndTurn),
        enabled: this.autoEndTurn.enabled,
      },
    });
  }

  /**
   * One whole step of zoom about a point of the screen: the cursor for the wheel, the middle of the
   * canvas for a key or a button. The HUD is not in the map camera, so it stays put.
   */
  private stepZoom(steps: number, screen: Pixel): void {
    if (this.state === null) return;

    const zoom = snapZoom(this.camera.zoom + steps);
    this.camera = zoomAround(this.camera, screen, zoom, this.bounds(), this.canvasSize());
    this.applyCamera();
  }

  /**
   * Settles the zoom onto a whole step, about the middle of the canvas. Fractional zoom leaves the pixel
   * art with seams, which is why a pinch is only fractional while the fingers are still moving.
   */
  private snapToWholeStep(): void {
    if (this.state === null) return;

    const canvas = this.canvasSize();
    const zoom = snapZoom(this.camera.zoom);
    if (zoom === this.camera.zoom) return;

    this.camera = zoomAround(
      this.camera,
      { x: canvas.width / 2, y: canvas.height / 2 },
      zoom,
      this.bounds(),
      canvas,
    );
    this.applyCamera();
  }

  /** Slides the camera over the map by a number of canvas pixels, kept inside the pan limit. */
  private moveCameraBy(dx: number, dy: number): void {
    if (this.state === null) return;

    const canvas = this.canvasSize();
    const bounds = this.bounds();
    const centre = {
      x: this.camera.centre.x + dx / this.camera.zoom,
      y: this.camera.centre.y + dy / this.camera.zoom,
    };

    this.camera = { zoom: this.camera.zoom, centre: clampPan(centre, this.camera.zoom, bounds, canvas) };
    this.applyCamera();
  }

  /** Brings the map back to the middle of the canvas, at the zoom it is already on. */
  private centreMap(): void {
    if (this.state === null) return;

    const canvas = this.canvasSize();
    const bounds = this.bounds();
    const middle = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    this.camera = { zoom: this.camera.zoom, centre: clampPan(middle, this.camera.zoom, bounds, canvas) };
    this.applyCamera();
  }

  /**
   * One control of the camera panel (EA-12). The panel is drawn by the HUD, which is told where the
   * camera ended up on the next redraw; the scene only decides what pressing a control does.
   */
  private pressCamera(control: CameraControl): void {
    const canvas = this.canvasSize();
    const middle = { x: canvas.width / 2, y: canvas.height / 2 };

    if (control === 'zoomIn') this.stepZoom(1, middle);
    if (control === 'zoomOut') this.stepZoom(-1, middle);
    if (control === 'centre') this.centreMap();
    if (control === 'rotateLeft') this.rotateView(-1);
    if (control === 'rotateRight') this.rotateView(1);
  }

  /** The canvas the camera is drawn on, which is the size every screen point is read against. */
  private canvasSize(): { width: number; height: number } {
    return { width: this.scale.width, height: this.scale.height };
  }

  /** The box the map fills in the current view, which is what the camera may not leave. */
  private bounds(): Rect {
    if (this.state === null) return { x: 0, y: 0, width: 0, height: 0 };
    return boardBounds(this.map?.size ?? this.state.board, (cell) => this.levelAt(cell), this.lift);
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

    // The areas come from the state, which states them in the map's own coordinates; the wash is drawn
    // on the cells of the view (EA-12).
    for (const cell of cells) {
      const view = this.viewCell(cell);
      const level = this.levelAt(view);
      // A gap has no top face to wash: nothing is aimed at it and no rule ever offers it.
      if (level === NO_FLOOR) continue;

      const graphic = this.add.graphics().setDepth(LAYER.highlight(view));
      const face = topFace(view, level, this.lift);

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

    // Which way round each figure is drawn is read in the view, not on the map: the rotation is what
    // decides who stands to the left of whom, so a unit turns with the view it is seen in (EA-12).
    const board = state.units.map((unit) => ({
      team: unit.team,
      position: this.viewCell(unit.position),
      permanentlyDead: unit.permanentlyDead,
      primaryClass: unit.primaryClass,
    }));

    for (const [index, unit] of state.units.entries()) {
      if (unit.permanentlyDead) continue;
      inPlay.add(unit.id);

      const marks = { selected: unit.id === this.selectedId, active: unit.id === activeId };
      const facing = facesRight(board[index]!, board);
      let sprite = this.sprites.get(unit.id);
      if (sprite === undefined) {
        sprite = new UnitSprite(this, unit, marks, this.placementOf(unit.position), facing);
        this.sprites.set(unit.id, sprite);
      } else {
        sprite.sync(unit, marks, this.placementOf(unit.position), facing);
      }

      // The words over its head are read from the board's own sides (EA-15), so they say the same thing
      // the rule does — and a unit that has fallen is covered by nothing.
      sprite.setCoverBadge(unit.defeated ? null : coverSentence(state.board, unit.position));
    }

    for (const id of [...this.sprites.keys()]) {
      if (inPlay.has(id)) continue;
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
    }
  }

  /** One frame of every animation on the board, and one of the countdown. The sprites advance. */
  update(time: number): void {
    this.advanceTurn(time);
    this.mapView?.update(time);
    for (const sprite of this.sprites.values()) sprite.tick(time);
    this.advanceAutoEndTurn(time);
  }

  /**
   * One frame of a turn of the view (EA-12, slice 3): the simplified board is drawn again at the angle
   * the turn has reached, and the view settles the moment it arrives. Nothing else of the match is
   * touched while it swings — the turn is a picture over the board, not a state of it.
   */
  private advanceTurn(time: number): void {
    const turn = this.turn;
    if (turn === null) return;

    const elapsed = time - turn.startedAt;
    turn.view.draw(elapsed);
    if (!simplifiedAt(rotationProgress(elapsed))) this.settleTurn(turn);
  }
}

/** What Phaser reports about a pointer, reduced to the little that the rules of a press need. */
function pressPointer(pointer: Phaser.Input.Pointer): PressPointer {
  return {
    id: pointer.id,
    at: { x: pointer.x, y: pointer.y },
    rightButton: pointer.rightButtonDown(),
    touch: pointer.wasTouch,
  };
}
