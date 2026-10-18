// The match: draws the public state, turns clicks into actions, and shows what the server answers.
// It decides nothing on its own — every rule lives on the server, and every label, colour and
// coordinate comes from the tested `game/` and `view/` modules.
import Phaser from 'phaser';
import { abilityById } from '@eldritch-alley/engine';
import {
  actionButtons,
  applyMode,
  availableActions,
  hasArmedAim,
  moveChips,
  presentButtons,
  settleMode,
  type ActionButton,
  type ActionMode,
  type MoveChip,
} from '../game/actions';
import { abilityOptions, type AbilityOption } from '../game/ability-menu';
import { advance, emptyQueue, enqueue, isIdle, type AnimationQueue } from '../game/animationQueue';
import { bannerFor } from '../game/banner';
import { abilityChances, attackChance } from '../game/targetPreview';
import { stepWaitMs } from '../game/cueTiming';
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
import { clampScroll, exportFileName, exportText, visibleLines, type BattleReportHeader } from '../game/battle-report';
import { coverSentence } from '../game/coverBadge';
import { readHighlightCovers, saveHighlightCovers } from '../game/highlightCovers';
import { buildEnv, highlightCoversDefault } from '../config';
import { HIT_MARGIN_PX, unitAtPoint, type SpriteLayout } from '../game/hit';
import { highlightedCells, highlightTone } from '../game/highlight';
import { describeEvent, describeRejection, type Battlefield, type UnitNames } from '../game/log';
import { presentationOf, type Cue, type Snapshot } from '../game/presentation';
import { Gestures, LONG_PRESS_MS, type Pinch, type PressPointer } from '../game/press';
import { resolveClick, resolveInspect } from '../game/selection';
import { activeSlot, isHumanTurn, turnOrder, type TurnSlot } from '../game/turn-order';
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
  ABILITY_MENU_CLOSE_RECT,
  ABILITY_MENU_RECT,
  BATTLE_REPORT_CLOSE_RECT,
  BATTLE_REPORT_EXPORT_RECT,
  BATTLE_REPORT_RECT,
  BATTLE_REPORT_REOPEN_RECT,
  BATTLE_REPORT_SCROLL_DOWN_RECT,
  BATTLE_REPORT_SCROLL_UP_RECT,
  LOG_LINES,
  LOG_TOGGLE_RECT,
  REPORT_LINES,
  abilityMenuRowIndexAt,
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
  HOVER_HIGHLIGHT_ALPHA,
  HOVER_HIGHLIGHT_COLOR,
} from '../view/theme';
import { BODY_HEIGHT, SPRITE_SIZE, corpseRoundsLeft } from '../view/unit-look';
import { download } from './download';
import { playEffect, playImpact } from './effects';
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
 * Whether two cells name the same tile, either of them being no tile at all. Both the aim's preview and
 * the mark of the tile under the mouse are held this way: they ask it before rebuilding what they drew,
 * so a mouse sweeping the board does not throw a `Graphics` away for a tile that has not changed.
 */
function sameCell(one: Cell | null, other: Cell | null): boolean {
  if (one === null || other === null) return one === other;

  return one.x === other.x && one.y === other.y;
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

/** One accepted action, waiting its turn in the animation queue (M4 playtest fix, P2). */
interface QueuedStep {
  readonly events: Event[];
  readonly message: StateMessage;
}

export class MatchScene extends Phaser.Scene {
  private session!: Session;
  private state: PublicState | null = null;
  private selectedId: string | null = null;
  /** The armed mode. `move` and `attack` narrow the next board click; `inspect` leaves it alone. */
  private mode: ActionMode = 'inspect';
  /**
   * The ability the menu armed (EA-16): the id the next aim is sent with, or null while no row has been
   * picked. It is only set while the ability mode is armed, and the mode is what the aim reads.
   */
  private armedAbilityId: string | null = null;
  /**
   * The fallen ally a two-click resurrection has already named, or null before the body is chosen
   * (ADR 0023 §7). It is the first step of the aim; the next click names the cell.
   */
  private reviveTargetId: string | null = null;
  /** Whether the ability menu is on the screen. It is a question, not a mode: it arms nothing by itself. */
  private menuOpen = false;
  /** The rows the open menu showed, so a press on one arms the ability the player read (EA-16). */
  private menuModel: AbilityOption[] = [];
  /** The unit the secondary gesture is inspecting, or null when no inspection is open (EA-6). */
  private inspectedId: string | null = null;
  /** The timer of the long press, which the rules of `game/press.ts` decide when to arm (EA-6, D4). */
  private pressTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * The cell an aim is being previewed over, or null while none is (EA-18): a mouse hover, or a
   * finger held long enough while `Atacar`/`Habilidade` is armed. It is a question the scene is
   * holding, not a property of the match, so it is never sent anywhere.
   */
  private previewCell: Cell | null = null;
  /**
   * The cell the mouse currently answers to: the board tile under the pointer, the cell of the figure
   * under it, or the position of the unit whose portrait of the turn queue is under it. It is a
   * question the scene is holding about the mouse, not a property of the match, so it is never sent
   * anywhere — and it is kept apart from `previewCell`, which answers a different question (D1).
   */
  private hoveredCell: Cell | null = null;
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
  /**
   * The whole match, one line per event, never trimmed (EA-17): what the battle report reads, kept
   * apart from `logLines`, which is only ever the dashboard's last six.
   */
  private fullLogLines: string[] = [];
  /** Whether the battle report is on the screen. Opens on its own the moment the match ends (EA-17). */
  private battleReportOpen = false;
  /** How far the report has scrolled, in lines from the top. */
  private reportScroll = 0;
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
  /** What the client knew of each unit when the last played step arrived, for `presentationOf`. */
  private snapshot = new Map<string, Snapshot>();
  /**
   * The events of an accepted action, held until the `state` they caused arrives right behind them
   * (M4 playtest fix, P2): null while nothing is waiting to be paired, which is also how a join or a
   * reconnect's resync — a `state` with no events of its own — is told apart from a normal action.
   */
  private pendingEvents: Event[] | null = null;
  /** One accepted action waiting its turn to play, so a burst of them never overwrites one another. */
  private animationQueue: AnimationQueue<QueuedStep> = emptyQueue();
  /** The unit this scene itself last saw on turn, the same question `bannerFor` asks (M4 playtest fix,
   * P3): read here too, because locking input on a hand-over is this scene's job, not the HUD's. */
  private lastActiveSlot: TurnSlot | null = null;
  /** Set until this moment while a turn-change banner is still on screen: the action bar refuses every
   * press until then, on top of refusing them while the animation queue is not idle (M4 playtest fix,
   * P3). */
  private inputLockedUntil: number | null = null;
  /** Whether End Turn is asking once before it is sent, because the unit on turn still has something
   * it could do instead (M4 playtest fix, P3). Any other press puts the question down unanswered. */
  private pendingEndTurnConfirm = false;
  /** Whether the bar was locked the last time this was checked, so `update` can tell the moment a lock
   * clears and push the HUD right then — otherwise nothing redraws it once the last queued step's own
   * timer fires with nothing left to play (critical fix, P3). */
  private wasInputLocked = false;

  /** Built from the first state the map id names: the map is not known before it arrives. */
  private map: Terrain | null = null;
  private mapView: MapView | null = null;
  /** One graphic per highlighted cell, at the cell's own depth, rebuilt on every redraw. */
  private highlights: Phaser.GameObjects.Graphics[] = [];
  /** The one mark of the tile under the mouse, or null while no tile is marked. */
  private hoverHighlight: Phaser.GameObjects.Graphics | null = null;
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
    this.armedAbilityId = null;
    this.menuOpen = false;
    this.inspectedId = null;
    this.disarmLongPress();
    this.gestures.cancel();
    this.previewCell = null;
    this.hoveredCell = null;
    this.pinchFrom = 0;
    this.pinchZoom = MIN_ZOOM;
    // Switching maps resets the view to N, so a match never opens from a side the last one was left on.
    this.viewSteps = 0;
    this.turn = null;
    this.logLines = [];
    this.logOpen = false;
    this.fullLogLines = [];
    this.battleReportOpen = false;
    this.reportScroll = 0;
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
    this.menuModel = [];
    this.reviveTargetId = null;
    this.statusText = '';
    this.resultText = '';
    this.camera = { zoom: MIN_ZOOM, centre: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 } };
    this.highlights = [];
    // The mark of the last match went with the display list it was drawn on; the reference must not
    // outlive it, or a later redraw would take down an object of a scene that is already gone.
    this.hoverHighlight = null;
    this.map = null;
    this.mapView = null;
    this.sprites = new Map();
    this.snapshot = new Map();
    this.pendingEvents = null;
    this.animationQueue = emptyQueue();
    this.lastActiveSlot = null;
    this.inputLockedUntil = null;
    this.pendingEndTurnConfirm = false;
    this.wasInputLocked = false;
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
      this.handleWheel(pointer, dy);
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
      // The emergency exit (P1 of the M4 playtest fixes): whatever is armed, Escape puts it down, so
      // the player is never stuck behind a preview or a menu with no way back to the action bar.
      if (event.key === 'Escape') this.cancelAim();
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
    this.pressTimer = this.time.delayedCall(LONG_PRESS_MS, () => this.triggerLongPress(pointer));
  }

  /**
   * The timer is spent: a finger that rested long enough is either previewing a shot or inspecting a
   * unit, never both. While `Atacar` or `Habilidade` is armed the hold is the touch answer to a hover
   * (EA-18, D1) — the odds are shown and nothing else happens, so a lift never taps as well (D4) and
   * the player presses again to actually commit the shot. Any other mode keeps today's inspection.
   */
  private triggerLongPress(pointer: Phaser.Input.Pointer): void {
    this.pressTimer = null;
    if (this.gestures.longPress().kind !== 'inspect') return;

    if (this.mode === 'attack' || this.mode === 'ability') {
      this.updatePreview(pointer);
      return;
    }
    this.handlePress(pointer, true);
  }

  private disarmLongPress(): void {
    this.pressTimer?.remove(false);
    this.pressTimer = null;
  }

  /**
   * A pointer moves. Two of them pinch the map; one of them drags it, and the drag begins only once the
   * gesture is no longer a tap — which is also when the press waiting under it is taken down, so a
   * click never nudges the map and panning never picks a cell by accident (EA-12).
   *
   * A mouse with no button down is a hover (EA-18): the touch answer is the long press above, so this
   * is the one outcome a finger never reports.
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const outcome = this.gestures.move(pressPointer(pointer));
    if (!this.gestures.waiting()) this.disarmLongPress();

    if (outcome.kind === 'hover') {
      this.updatePreview(pointer);
      this.updateHoveredCell(pointer);
    } else if (outcome.kind === 'pinch') this.pinchTo(outcome.pinch);
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
   *
   * A lift that was not a tap also takes the preview down (EA-18): a mouse that clicked through it is
   * about to redraw the board anyway, and a finger that held it is no longer resting on anything.
   */
  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const outcome = this.gestures.up(pressPointer(pointer));
    this.disarmLongPress();
    this.endPinch();

    if (outcome.kind === 'tap') this.handlePress(pointer, false);
    else this.setPreviewCell(null);
  }

  /**
   * Reads which cell a hover or a held finger is over, the way a press itself does, and keeps it only
   * while an aim could read it: the view must not be mid-turn (DT-86), and a mode with nothing to aim
   * has nothing to preview.
   */
  private updatePreview(pointer: Phaser.Input.Pointer): void {
    const state = this.state;
    if (state === null || this.turn !== null || (this.mode !== 'attack' && this.mode !== 'ability')) {
      this.setPreviewCell(null);
      return;
    }

    this.setPreviewCell(this.cellUnderPointer({ x: pointer.worldX, y: pointer.worldY }, state));
  }

  /**
   * The cell a point of the world answers to, read the way a press reads one (EA-8): the cell of the
   * figure of a unit drawn under the point, and the tile the projection finds there only when no figure
   * covers it. The aim's preview and the mark of the tile under the mouse ask the same question, so they
   * take the same answer.
   */
  private cellUnderPointer(world: Pixel, state: PublicState): Cell | null {
    const hit = unitAtPoint(this.inView(state.units), world, this.spriteLayout);
    const view =
      hit?.position ??
      cellAt(world, this.map?.size ?? state.board, (candidate) => this.levelAt(candidate), this.lift);

    return view === null ? null : this.mapCell(view);
  }

  /** Keeps the cell the preview is asking about, and redraws only the badges it can change (D2). */
  private setPreviewCell(cell: Cell | null): void {
    if (sameCell(this.previewCell, cell)) return;

    this.previewCell = cell;
    this.drawTargetPreview(this.state);
  }

  /**
   * `computeTargetPreview`'s own answer, or none at all if working it out throws (critical fix): a
   * badge is decoration over whatever event just arrived, and losing it must never also lose that
   * event — the same "a failure loses the feature, not the match" rule the auto-end-turn setting's
   * own storage read already follows (EA-4).
   */
  private targetPreviewChances(state: PublicState): ReadonlyMap<string, number> {
    try {
      return this.computeTargetPreview(state);
    } catch (error) {
      console.error('MatchScene: failed to work out the target preview', error);
      return new Map();
    }
  }

  /**
   * The odds the preview cell asks about, read fresh every time: a basic attack against whoever stands
   * there, or every living body an armed ability would reach from it (EA-18). Never a cell the current
   * highlight would not legally offer — the badge is a readout of a shot the player could take, not a
   * hint about one they could not.
   */
  private computeTargetPreview(state: PublicState): ReadonlyMap<string, number> {
    const previewCell = this.previewCell;
    if (previewCell === null || (this.mode !== 'attack' && this.mode !== 'ability')) return new Map();

    const acting = state.units.find((unit) => unit.id === this.selectedId);
    if (acting === undefined || acting.defeated || state.initiative[state.currentIndex] !== acting.id) {
      return new Map();
    }

    const legalCells = highlightedCells({
      state,
      selectedId: this.selectedId,
      inspectedId: this.inspectedId,
      mode: this.mode,
      humanTeam: HUMAN_TEAM,
      abilityId: this.armedAbilityId,
    });
    if (!legalCells.some((cell) => cell.x === previewCell.x && cell.y === previewCell.y)) return new Map();

    if (this.mode === 'attack') {
      const target = state.units.find(
        (unit) =>
          !unit.permanentlyDead &&
          unit.position.x === previewCell.x &&
          unit.position.y === previewCell.y,
      );
      if (target === undefined || target.defeated || target.team === HUMAN_TEAM) return new Map();

      return new Map([[target.id, attackChance(state, acting, target)]]);
    }

    const abilityId = this.armedAbilityId ?? acting.abilities.activeSets[0];
    const ability = abilityId === null ? undefined : abilityById(state.catalog, abilityId);
    if (ability === undefined) return new Map();

    return abilityChances(state, acting, ability, previewCell);
  }

  /** Writes the odds over every sprite's head, or takes them all down while nothing is being aimed. */
  private drawTargetPreview(state: PublicState | null): void {
    const chances = state === null ? new Map<string, number>() : this.targetPreviewChances(state);

    for (const [id, sprite] of this.sprites) {
      const chance = chances.get(id);
      sprite.setHitChanceBadge(chance === undefined ? null : t('hud.target.chance', { value: chance }));
    }
  }

  /**
   * Reads which tile the mouse is answering to, and keeps it. It is a portrait of the turn queue
   * first, then the board — the two readings a press already runs, in the order a press runs them
   * (EA-8) — so the tile the mark lands on is the tile a click there would act on.
   *
   * The mark answers "what is under the mouse", not "what could I do now", so nothing about the armed
   * mode is read here (D3): it keeps working while the bot plays and while a replay's camera swings.
   * A match that is decided has no board being played, so nothing on it is marked either (D5).
   */
  private updateHoveredCell(pointer: Phaser.Input.Pointer): void {
    const state = this.state;
    if (state === null || this.finished) {
      this.setHoveredCell(null);
      return;
    }

    const point = { x: pointer.x, y: pointer.y };
    const portrait = this.portraitAt(state, point);
    if (portrait !== null) {
      this.setHoveredCell(portrait.position);
      return;
    }

    // A point the HUD owns is the HUD's, whatever tile the world has behind it.
    if (this.hudCoversPoint(point)) {
      this.setHoveredCell(null);
      return;
    }

    // The same resolution a press runs: the figure of a unit first, and the cell under the point only
    // when no drawn figure covers it (EA-8).
    this.setHoveredCell(this.cellUnderPointer({ x: pointer.worldX, y: pointer.worldY }, state));
  }

  /**
   * Keeps the tile the mark is on, and redraws only the mark it can change — a no-op while the tile is
   * the one already marked, so a mouse sweeping the board never throws a `Graphics` away and makes it
   * again for a tile that has not changed (DT-46).
   */
  private setHoveredCell(cell: Cell | null): void {
    if (sameCell(this.hoveredCell, cell)) return;

    this.hoveredCell = cell;
    this.drawHoverHighlight(this.state);
  }

  /**
   * The outline of the tile under the mouse: a stroke and no fill, so the wash of a move or of an
   * attack under it is still read (D2). A gap has no top face to outline, and a scene with no state
   * has no board to mark; the mark is taken down in both cases.
   */
  private drawHoverHighlight(state: PublicState | null): void {
    this.hoverHighlight?.destroy();
    this.hoverHighlight = null;

    const cell = this.hoveredCell;
    if (cell === null || state === null) return;

    const view = this.viewCell(cell);
    const level = this.levelAt(view);
    if (level === NO_FLOOR) return;

    const graphic = this.add.graphics().setDepth(LAYER.hover(view));
    const face = topFace(view, level, this.lift);

    graphic.lineStyle(2, HOVER_HIGHLIGHT_COLOR, HOVER_HIGHLIGHT_ALPHA);
    graphic.strokePoints(face, true, true);
    this.hoverHighlight = graphic;
  }

  /**
   * Whether the HUD owns this point, read as a question and nothing more: it is the containment half
   * of `hudTakesPress`, which bundles each check together with the click's own side effect and so
   * cannot be asked without acting (D4). The two are the same list of pieces read in the same order
   * and must be kept in step by hand: while the menu is up it takes every point of the canvas, the
   * inspection window floats over the board and over every panel, then the countdown, the gear and its
   * panel, the log, the bar, the camera panel, the chips of a pending move, and finally every
   * rectangle `hudRects` lists.
   */
  private hudCoversPoint(point: Pixel): boolean {
    if (this.menuOpen) return true;
    if (this.inspectedId !== null && containsPoint(INSPECT_RECT, point)) return true;
    if (
      this.autoEndTurn.phase === 'counting' &&
      (containsPoint(COUNTDOWN_LINK_RECT, point) || containsPoint(COUNTDOWN_RECT, point))
    ) {
      return true;
    }
    if (containsPoint(SETTINGS_BUTTON_RECT, point)) return true;
    if (this.settingsOpen && containsPoint(SETTINGS_PANEL_RECT, point)) return true;
    if (containsPoint(logRect(this.logOpen), point)) return true;
    if (buttonIndexAt(point) !== null) return true;
    if (containsPoint(CAMERA_RECT, point)) return true;
    if (moveChipIndexAt(point) !== null) return true;

    return hudRects().some((rect) => containsPoint(rect, point));
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
    // The ability menu (EA-16) is a modal and is read before everything else it covers: while it is on
    // the screen it swallows every press of the canvas, so nothing under the question is pressed (D2).
    if (this.menuOpen) {
      this.pressAbilityMenu(point);
      return true;
    }

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

    if (this.finished) {
      // The report is a modal over everything else a finished match shows, including `Sair` itself: a
      // press outside it only closes it, and the way out works once it is not standing over it (EA-17,
      // D2 — the same rule the ability menu already follows).
      if (this.battleReportOpen) {
        this.pressBattleReport(point);
        return;
      }
      if (containsPoint(RESULT_BUTTON_RECT, point)) {
        this.leave();
        return;
      }
      if (containsPoint(BATTLE_REPORT_REOPEN_RECT, point)) {
        this.openBattleReport();
        return;
      }
      return;
    }
    if (this.state === null) return;

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
    // with `Atacar` armed (EA-7 as amended: the destination is the move, Confirmar commits it), and an
    // aim with `Habilidade` armed, which is the one mode the click itself has to read (ADR 0016 §5).
    const clicked = resolveClick({
      state,
      selectedId: this.selectedId,
      cell,
      targetId: named?.id ?? null,
      humanTeam: HUMAN_TEAM,
      mode: this.mode,
      abilityId: this.armedAbilityId,
      reviveTargetId: this.reviveTargetId,
    });

    // A resurrection is aimed in two clicks (ADR 0023 §7). This intent is not an action of any armed
    // mode, so it is kept here, before `applyMode` narrows it away: the first click only names the body,
    // and the panel asks for the cell the next one has to name.
    if (clicked.kind === 'revive-target') {
      this.reviveTargetId = clicked.unitId;
      this.pushHud();
      return;
    }

    const intent = applyMode(this.mode, clicked);

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

  /** Whether the action bar refuses every press right now: a transition still on screen (M4 playtest
   * fix, P3), either the animation queue still playing a burst of actions, or the banner it raised
   * still fading — whichever of the two outlasts the other. */
  private isInputLocked(): boolean {
    if (!isIdle(this.animationQueue)) return true;
    return this.inputLockedUntil !== null && this.time.now < this.inputLockedUntil;
  }

  /** Arms the button's mode, or cancels it when it is already armed, so the bar is its own undo. */
  private pressAction(id: ActionButton['id'], mode: ActionMode | null): void {
    if (this.finished || this.state === null) return;
    // Nothing reaches the server while a transition is still on screen (M4 playtest fix, P3): the
    // press is refused exactly where the HUD already shows the bar as locked, not silently elsewhere.
    if (this.isInputLocked()) return;

    // Any press but a second one on End Turn itself answers the question with nothing (M4 playtest
    // fix, P3): the player went on to do something else, so there is nothing left to confirm.
    if (id !== 'endTurn' && this.pendingEndTurnConfirm) this.pendingEndTurnConfirm = false;

    if (mode !== null) {
      // `Habilidade` asks before it arms (EA-16): the menu names what the unit carries, what it costs
      // and what it does, and the row the player picks is what the aim is aimed with. The other two
      // modes have nothing to ask, so they arm on the press as they always did.
      if (mode === 'ability') {
        this.toggleAbilityMenu();
        return;
      }

      this.mode = this.mode === mode ? 'inspect' : mode;
      this.redraw(this.state);
      return;
    }

    if (id === 'endTurn' && !this.pendingEndTurnConfirm && !availableActions(this.state, HUMAN_TEAM).nothingLeft) {
      // Something is still available, so the first press only asks: a player who meant to pass with
      // options open still can, one press later, and one who did not never loses the turn by accident
      // (M4 playtest fix, P3). Nothing left to do skips the question — auto end of turn is about to
      // ask the same thing on its own.
      this.pendingEndTurnConfirm = true;
      this.pushHud();
      return;
    }
    this.pendingEndTurnConfirm = false;

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

  /**
   * Opens or closes the ability menu (EA-16). The bar is its own undo, so pressing `Habilidade` while
   * the rows are on the screen closes them and arms nothing; pressing it with the aim already armed —
   * which is what a pick leaves behind — puts the aim down too.
   */
  private toggleAbilityMenu(): void {
    if (this.menuOpen) {
      this.closeAbilityMenu();
      this.pushHud();
      return;
    }

    if (this.mode === 'ability') {
      this.mode = 'inspect';
      this.armedAbilityId = null;
      if (this.state !== null) this.redraw(this.state);
      return;
    }

    this.menuOpen = true;
    // The player is deciding, so the turn must not pass behind the question: the countdown stands down
    // the way it does when the turn is handed over by hand (D4).
    this.applyAutoEndTurn({ type: 'cancel' });
    this.pushHud();
  }

  /** Takes the question off the screen. What it drew is redrawn by whoever called it. */
  private closeAbilityMenu(): void {
    this.menuOpen = false;
  }

  /**
   * The emergency exit (P1 of the M4 playtest fixes): whatever aim is armed falls back to inspection,
   * so the player is never stuck with no way back to the action bar, whatever the cause. A press with
   * nothing armed does nothing, so Escape is safe to send at any time.
   */
  private cancelAim(): void {
    if (!hasArmedAim(this.mode, this.menuOpen)) return;

    this.closeAbilityMenu();
    this.mode = 'inspect';
    this.armedAbilityId = null;
    this.setPreviewCell(null);
    if (this.state !== null) this.redraw(this.state);
  }

  /** A press while the menu is open: its X and its rows are its own, and a press outside closes it. */
  private pressAbilityMenu(point: Pixel): void {
    if (!containsPoint(ABILITY_MENU_RECT, point) || containsPoint(ABILITY_MENU_CLOSE_RECT, point)) {
      this.closeAbilityMenu();
      this.pushHud();
      return;
    }

    // The title and the gaps between the rows are the panel's own: a press on them asks nothing.
    const row = abilityMenuRowIndexAt(point);
    if (row !== null) this.pickAbility(row);
  }

  /**
   * Arms the ability of one row: the reach drawn is its own and the action the next aim sends names it
   * (EA-16). A row the unit's pool cannot pay arms nothing — the same refusal the engine would answer
   * with, asked before the player aims rather than after.
   */
  private pickAbility(index: number): void {
    const option = this.menuModel[index];
    if (option === undefined || !option.affordable) return;

    this.armedAbilityId = option.id;
    this.mode = 'ability';
    this.reviveTargetId = null;
    this.closeAbilityMenu();
    if (this.state !== null) this.redraw(this.state);
  }

  /** The rows an open menu would show: what the unit on turn carries, and nothing without a state. */
  private abilityRows(): AbilityOption[] {
    if (this.state === null) return [];

    const actor = activeSlot(this.state);
    return actor === null ? [] : abilityOptions(this.state, actor.unit);
  }

  /**
   * A `state` message on its own, with no `events` paired to it, is nothing an action caused: the
   * join, or the resync after a reconnect. There is no board to pace it against, so the queue is
   * cleared — whatever it was mid-way through no longer matches what the server just sent — and the
   * state is applied at once (M4 playtest fix, P2).
   */
  private handleState(message: StateMessage): void {
    if (message.version !== PROTOCOL_VERSION) {
      this.statusText = t('match.versionMismatch');
      this.pushHud();
      return;
    }

    const events = this.pendingEvents;
    this.pendingEvents = null;

    if (events === null) {
      this.animationQueue = emptyQueue();
      this.applyStep([], message);
      return;
    }

    this.enqueueStep({ events, message });
  }

  /**
   * Adds a step to the animation queue (P2): it plays at once if the queue was idle, or waits behind
   * whatever is already playing, in the order the server sent it.
   */
  private enqueueStep(step: QueuedStep): void {
    const wasIdle = isIdle(this.animationQueue);
    this.animationQueue = enqueue(this.animationQueue, step);
    if (wasIdle) this.playStep(step);
  }

  /**
   * Plays one queued step and, once its own cues have had time to finish, moves on to the next. A
   * step that fails to apply — a presentation bug, anything — must still hand the queue on: the only
   * thing standing between a thrown error and every future action landing on a bar stuck locked for
   * the rest of the match is this catch (critical fix). The failure is lost; the match is not.
   */
  private playStep(step: QueuedStep): void {
    // Read before `applyStep` moves `this.state` on: whoever was on turn when this step was accepted,
    // which is the team `stepWaitMs` asks about — a pure bot skip still gets a wait, a human's own
    // deliberate end of turn never does (M4 playtest fix, P2).
    const actingTeam = this.state === null ? null : (activeSlot(this.state)?.unit.team ?? null);
    let cues: Cue[] = [];
    try {
      cues = this.applyStep(step.events, step.message);
    } catch (error) {
      console.error('MatchScene: a queued step failed to apply; moving on to the next one', error);
    }
    this.time.delayedCall(stepWaitMs(cues, actingTeam, HUMAN_TEAM), () => this.advanceQueue());
  }

  private advanceQueue(): void {
    this.animationQueue = advance(this.animationQueue);
    if (this.animationQueue.current !== null) this.playStep(this.animationQueue.current);
  }

  /**
   * Everything one accepted action does to the board: its cues, its log line, the state it leaves
   * behind and the redraw that shows it — in that order, exactly as a single action always played
   * before the queue existed. `playStep` paces calls to this against the cues it returns; the message
   * with nothing to pace against (`handleState` above) calls it directly instead.
   */
  private applyStep(events: Event[], message: StateMessage): Cue[] {
    // Each event is read against the board it found, before the state that follows it moves `this.
    // snapshot` on, which is also what the log is handed (EA-15): a shot says where both ends stood.
    const cues: Cue[] = [];
    for (const event of events) {
      const eventCues = presentationOf(event, this.snapshot, message.state);
      eventCues.forEach((cue) => this.play(cue));
      cues.push(...eventCues);
      this.appendLog(describeEvent(event, UNIT_NAMES, this.battlefield()));
      this.advanceSnapshot(event);
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
    const available = availableActions(message.state, HUMAN_TEAM);
    this.mode = settleMode(this.mode, available);
    // The question only stands while the turn can still answer it (EA-16): an aim that fell back to
    // another mode is put down, and so is a menu whose unit has nothing left to offer.
    if (this.mode !== 'ability') this.armedAbilityId = null;
    // A new state settles the board: a body chosen before it may no longer be there (ADR 0023 §7).
    this.reviveTargetId = null;
    if (!available.canUseAbility) this.closeAbilityMenu();
    this.syncAutoEndTurn();

    // The same hand-over the banner itself reads (EA-3): the action bar is locked for as long as the
    // banner it raises would be on screen, so a press never lands in the instant control changes hands
    // (M4 playtest fix, P3). A state that leaves the unit on turn alone — a move, a shot — locks
    // nothing, and neither does the match's own opening state: nobody has had the turn taken from them
    // yet, so there is nothing a first press could skip by accident.
    const banner = this.lastActiveSlot === null ? null : bannerFor(this.lastActiveSlot, actor, HUMAN_TEAM);
    if (banner !== null) this.inputLockedUntil = this.time.now + banner.durationMs;
    this.lastActiveSlot = actor;
    // Whatever was pending no longer applies to whatever the turn looks like now (M4 playtest fix, P3).
    this.pendingEndTurnConfirm = false;

    this.redraw(message.state);

    if (this.reconnecting) {
      this.reconnecting = false;
      this.statusText = '';
      this.pushHud();
    }

    return cues;
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

  /** The difficult cells of the state, read in the cells of the view the map is drawn from (ADR 0023 §4). */
  private difficultCells(state: PublicState | null): Cell[] {
    if (state === null) return [];
    return state.difficultTerrain.map((cell) => this.viewCell(cell.position));
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
    // The hover preview was held down for the turn (DT-86) and nothing but a pointer move brings it
    // back on its own; a player who rotated by pressing a panel button or Q/E never moves the pointer
    // afterwards, so the aim is read again right here, against wherever it already is (P1 of the M4
    // playtest fixes).
    this.updatePreview(this.input.activePointer);
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
   * Where an impact lands on a cell of the map (EA-16): the top face of the tile as the view draws it,
   * which is where a figure standing there has its feet and where the marks of the board are drawn. An
   * impact reads the map's own cells, so it is turned with the view like everything else the server
   * states (EA-12).
   */
  private impactPoint(cell: Cell): Pixel {
    return this.feetOf(this.viewCell(cell));
  }

  /**
   * Remembers the events of one accepted action until the `state` they caused arrives right behind
   * them, so the two are read together as one step of the animation queue (M4 playtest fix, P2).
   */
  private handleEvents(events: Event[]): void {
    this.pendingEvents = events;
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
        const delay = actor.playAttack(
          { style: cue.style, hit: cue.hit, travelMs: cue.effect.travelMs },
          this.time.now,
          () => playEffect(this, cue.effect, from, to),
        );
        // The target's own result waits for the same impact the visual effect does, so the HP bar
        // never changes before the swing that caused it (M4 playtest fix, P2).
        target.expectImpact(this.time.now, delay);
        break;
      }

      case 'reload':
        this.sprites.get(cue.unitId)?.playReload(cue.from, cue.to, this.time.now);
        break;

      case 'ability': {
        // The effect is thrown from the caster's figure, and lands on the cells of the view: an impact
        // carries the map's own cells, and the board on the screen is a view of them (EA-12, EA-16).
        const actor = this.sprites.get(cue.actorId);
        playImpact(this, cue.impact, {
          // A figure the scene is not drawing has no hand for a shot to leave: the flight is dropped
          // and the landing kept, and the areas, which need no caster, are drawn all the same.
          from: actor === undefined ? null : this.effectPoint(actor, false),
          at: (cell) => this.impactPoint(cell),
        });
        break;
      }

      // The three cues of the second active set are changes the next state confirms too; taking them
      // off when the event arrives keeps the drawing from lagging behind the batch (ADR 0023).
      case 'camouflage-ended':
        this.sprites.get(cue.unitId)?.setCamouflage(false);
        break;

      case 'stand-up':
        this.sprites.get(cue.unitId)?.setProne(false);
        break;

      case 'terrain-expired':
        this.mapView?.removeDifficultTerrain(cue.cells.map((cell) => this.viewCell(cell)));
        break;

      // The revived figure is created by the state that follows the event; nothing to play before it.
      case 'revive':
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
    // The battle report reads the whole match, so nothing is trimmed here (EA-17): only the dashboard's
    // own six-line ring forgets a line for good.
    this.fullLogLines.push(line);
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
    // No board is being played any more, so nothing on it stays marked as hovered (D5): the result
    // screen and the battle report are read against nothing the mouse is over.
    this.setHoveredCell(null);
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
    this.armedAbilityId = null;
    this.closeAbilityMenu();
    this.selectedId = null;
    this.statusText = '';
    this.resultText = t(message.winner === HUMAN_TEAM ? 'match.victory' : 'match.defeat');
    // The whole fight is worth reading back the moment it is decided, not only its last six lines
    // (EA-17, the owner's own request): the report opens on its own, scrolled to the top.
    this.battleReportOpen = true;
    this.reportScroll = 0;
    this.pushHud();
  }

  /** Opens the report again, scrolled to the top — the way back in from the "Ver registro" link. */
  private openBattleReport(): void {
    this.battleReportOpen = true;
    this.reportScroll = 0;
    this.pushHud();
  }

  /** Takes the report off the screen. What it drew is redrawn by whoever called it. */
  private closeBattleReport(): void {
    this.battleReportOpen = false;
  }

  /** A press while the report is open: its X, its chevrons and its export button are its own, and a
   * press outside it closes it (EA-17, D2). */
  private pressBattleReport(point: Pixel): void {
    if (!containsPoint(BATTLE_REPORT_RECT, point) || containsPoint(BATTLE_REPORT_CLOSE_RECT, point)) {
      this.closeBattleReport();
      this.pushHud();
      return;
    }
    if (containsPoint(BATTLE_REPORT_SCROLL_UP_RECT, point)) this.scrollBattleReport(-1);
    else if (containsPoint(BATTLE_REPORT_SCROLL_DOWN_RECT, point)) this.scrollBattleReport(1);
    else if (containsPoint(BATTLE_REPORT_EXPORT_RECT, point)) this.exportBattleReport();
  }

  /** Moves the report a few lines, clamped to what it actually holds (EA-17). */
  private scrollBattleReport(direction: 1 | -1): void {
    const step = 3;
    this.reportScroll = clampScroll(this.reportScroll + direction * step, this.fullLogLines.length, REPORT_LINES);
    this.pushHud();
  }

  /** Hands the browser the whole match as a plain-text file, through the one I/O seam (EA-17). */
  private exportBattleReport(): void {
    const header: BattleReportHeader = { result: this.resultText, endedAt: new Date() };
    download.text(exportFileName(header.endedAt), exportText(header, this.fullLogLines));
  }

  private redraw(state: PublicState): void {
    this.drawHighlights(state);
    this.redrawUnits(state);
    this.drawCoveredBuildings(state);
    // The overlay always answers with the whole set the state names: a recast replaces a cell, and a
    // state that has dried a cell leaves it out (ADR 0023 §4).
    this.mapView?.setDifficultTerrain(this.difficultCells(state));
    this.pushHud();
  }

  /**
   * The buildings the player cannot see past, drawn translucent so what they hide shows through: the
   * ones standing over a unit's figure (EA-12, slice 4). Only the view is touched — for the rules the
   * building is whole — and a building the view has already cut down is left solid, because there is
   * nothing left behind it to hide.
   *
   * The tile under the mouse is not among them yet: the client has a hover to read one from now, but
   * fading what stands over it is a follow-up of its own and not asked for here.
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

  /**
   * The line the panel shows while a resurrection waits for a click (ADR 0023 §7): the body first, then
   * the cell. Empty when no resurrection is armed, so every other status keeps the line it had.
   */
  private reviveHint(): string {
    if (this.state === null || this.mode !== 'ability' || this.armedAbilityId === null) return '';

    const ability = abilityById(this.state.catalog, this.armedAbilityId);
    if (ability === undefined || ability.effect.kind !== 'revive') return '';

    return t(this.reviveTargetId === null ? 'hud.revive.pickBody' : 'hud.revive.pickCell');
  }

  /** Hands the HUD what it shows now, and keeps the model of its buttons for the clicks. */
  private pushHud(): void {
    // Remembered so `advanceInputLock` can tell a lock that cleared since this last render from one
    // it already drew locked — never from whatever `update` last happened to see (critical fix, P3).
    const locked = this.isInputLocked();
    this.wasInputLocked = locked;
    this.buttonModel = this.state
      ? presentButtons(actionButtons(this.state, HUMAN_TEAM), {
          locked,
          confirmEndTurn: this.pendingEndTurnConfirm,
        })
      : [];
    this.chipModel = this.state ? moveChips(this.state, HUMAN_TEAM) : [];
    // The rows are read here, with the rest of the models, and only while the question is on the screen:
    // a list nobody can see is not worth building (EA-16).
    this.menuModel = this.menuOpen ? this.abilityRows() : [];
    // Every other mutation already ends up here (a mode change, a state update, the match finishing),
    // so this is the one place a stale preview is caught and taken down (EA-18). The high-frequency
    // path, a mouse sweeping the board, goes through `setPreviewCell` instead and skips the rest of
    // this method's own work.
    this.drawTargetPreview(this.state);
    // The same catch for the mark of the tile under the mouse: every other mutation ends up here, so
    // this is where a mark left over from a board that has moved on is taken down. The high-frequency
    // path, a mouse sweeping the board, goes through `setHoveredCell` and skips the rest of this
    // method's work, exactly as the preview does.
    this.drawHoverHighlight(this.state);
    const reportTotal = this.fullLogLines.length;
    const reportFrom = reportTotal === 0 ? 0 : this.reportScroll + 1;
    const reportTo = reportTotal === 0 ? 0 : Math.min(this.reportScroll + REPORT_LINES, reportTotal);
    this.hud.render({
      state: this.state,
      humanTeam: HUMAN_TEAM,
      selectedId: this.selectedId,
      inspectedId: this.inspectedId,
      mode: this.mode,
      finished: this.finished,
      buttons: this.buttonModel,
      moveChips: this.chipModel,
      abilityMenu: { open: this.menuOpen, options: this.menuModel },
      logLines: this.logLines,
      logOpen: this.logOpen,
      // The full match, read back the moment it ends (EA-17): a window of `fullLogLines`, the range it
      // covers already worded in the player's language, and whether either chevron still does anything.
      battleReport: {
        open: this.battleReportOpen,
        lines: visibleLines(this.fullLogLines, this.reportScroll, REPORT_LINES),
        range: t('hud.report.range', { from: reportFrom, to: reportTo, total: reportTotal }),
        canScrollUp: this.reportScroll > 0,
        canScrollDown: this.reportScroll + REPORT_LINES < reportTotal,
        canReopen: this.finished && !this.battleReportOpen,
      },
      status: this.statusText || this.reviveHint(),
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
   * The wheel zooms the map, unless the battle report is open and the wheel is over it — then it
   * scrolls the report instead (EA-17). The report floats over the board like every other modal, so
   * its own rectangle is read before the camera's.
   */
  private handleWheel(pointer: Phaser.Input.Pointer, dy: number): void {
    const point = { x: pointer.x, y: pointer.y };
    if (this.battleReportOpen && containsPoint(BATTLE_REPORT_RECT, point)) {
      this.scrollBattleReport(dy < 0 ? -1 : 1);
      return;
    }
    this.stepZoom(dy < 0 ? 1 : -1, point);
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
      // The reach of the ability the menu armed, so the wash answers the question the player asked and
      // not the one the unit carries by default (EA-16).
      abilityId: this.armedAbilityId,
      // Once the body is named, the wash offers only the free cells the resurrection may bring it to
      // (ADR 0023 §7).
      reviveTargetId: this.reviveTargetId,
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
      // A body is a resource while a resurrection can still reach it, so its remaining rounds are
      // drawn over it for either team (ADR 0023 §7).
      sprite.setCorpseCountdown(corpseRoundsLeft(state.round, unit));
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
    this.advanceInputLock();
  }

  /**
   * Notices the moment a lock on the action bar clears on its own — the animation queue's own timer
   * firing with nothing left to play, or the banner's own deadline passing — and pushes the HUD right
   * then (critical fix, P3). Nothing else does: the queue advancing calls nothing that redraws the
   * bar, and a deadline is not a message that arrives and triggers one either. Without this, a player
   * is stuck looking at a disabled panel until something unrelated happens to redraw it, such as
   * moving the camera.
   */
  private advanceInputLock(): void {
    const locked = this.isInputLocked();
    if (locked === this.wasInputLocked) return;

    this.wasInputLocked = locked;
    this.pushHud();
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
