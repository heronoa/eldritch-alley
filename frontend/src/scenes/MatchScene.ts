// The match: draws the public state, turns clicks into actions, and shows what the server answers.
// It decides nothing on its own — every rule lives on the server, and every label, colour and
// coordinate comes from the tested `game/` and `view/` modules.
import Phaser from 'phaser';
import {
  actionButtons,
  applyMode,
  availableActions,
  settleMode,
  type ActionButton,
  type ActionMode,
} from '../game/actions';
import { highlightedCells } from '../game/highlight';
import { describeEvent, describeRejection, type UnitNames } from '../game/log';
import { presentationOf, type Cue, type Snapshot } from '../game/presentation';
import { resolveClick } from '../game/selection';
import { terrainOf, type Terrain } from '../maps/terrain';
import { Session } from '../net/session';
import {
  PROTOCOL_VERSION,
  type ClientAction,
  type EndedMessage,
  type Event,
  type PublicState,
  type StateMessage,
  type Team,
  type UnitState,
} from '../protocol';
import { NO_FLOOR, type Cell, type Pixel } from '../view/grid';
import { MIN_ZOOM, zoomAbout, type CameraView } from '../view/camera';
import { cellAt, cellToScreen, depthOfCell, topFace } from '../view/iso';
import {
  LOG_LINES,
  buttonIndexAt,
  RESULT_BUTTON_RECT,
  containsPoint,
  hudRects,
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

/** How far over its own cell a highlight is drawn, so the tile under it stays visible. */
const HIGHLIGHT_DEPTH_STEP = 0.1;

/** How far one wheel notch, and one key press, zoom the map. */
const WHEEL_ZOOM_STEP = 1.15;
const KEY_ZOOM_STEP = 1.25;

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
function immediateAction(id: ActionButton['id']): ClientAction | null {
  switch (id) {
    case 'reload':
      return { type: 'reload' };
    case 'endTurn':
      return { type: 'endTurn' };
    default:
      return null;
  }
}

export class MatchScene extends Phaser.Scene {
  private session!: Session;
  private state: PublicState | null = null;
  private selectedId: string | null = null;
  /** The armed mode. `move` and `attack` narrow the next board click; `inspect` leaves it alone. */
  private mode: ActionMode = 'inspect';
  private logLines: string[] = [];
  /** Set when the match is over or lost, after which clicks are ignored. */
  private finished = false;
  /** True while waiting for a reconnection, so the first state that arrives can clear the notice. */
  private reconnecting = false;

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
    this.logLines = [];
    this.finished = false;
    this.reconnecting = false;
    this.buttonModel = [];
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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));
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
      this.mapView?.destroy();
      this.mapView = null;
      this.map = null;
      this.scene.stop('hud');
    });

    this.session.onState((message) => this.handleState(message));
    this.session.onEvents((events) => this.handleEvents(events));
    this.session.onRejected((message) => this.appendLog(describeRejection(message.reason)));
    this.session.onEnded((message) => this.handleEnded(message));
    this.session.onDrop(() => {
      void this.handleDrop();
    });

  }

  /**
   * The HUD is tested first and consumes the click: the action bar against the same rectangle that
   * draws each button (DT-30), then any point inside any HUD rectangle, even where no control is, so
   * a panel floating over a tile never lets a click through to the tile. Only what is left reaches
   * the board, and what it means there is decided by `resolveClick`, narrowed by `applyMode`; the
   * server decides the rest.
   */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    // The HUD is not zoomed, so its rectangles are tested in screen space; the board is zoomed, so it is
    // tested in the world space the pointer reports for the map camera.
    const point = { x: pointer.x, y: pointer.y };
    const world = { x: pointer.worldX, y: pointer.worldY };

    if (this.finished && containsPoint(RESULT_BUTTON_RECT, point)) {
      this.leave();
      return;
    }
    if (this.finished || this.state === null) return;

    const buttonIndex = buttonIndexAt(point);
    if (buttonIndex !== null) {
      const button = this.buttonModel[buttonIndex];
      if (button !== undefined && button.enabled) this.pressAction(button.id, button.mode);
      return;
    }

    if (hudRects().some((rect) => containsPoint(rect, point))) return;

    // The board the state carries says how big it is; what each cell is drawn at comes from the map,
    // lift included, so a click lands on the cell the player aimed at.
    const cell = cellAt(
      world,
      this.state.board,
      (candidate) => this.levelAt(candidate),
      this.lift,
    );
    if (cell === null) return;

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
      case 'move-preview':
      case 'none':
        break;
    }
  }

  /** Arms the button's mode, or cancels it when it is already armed, so the bar is its own undo. */
  private pressAction(id: ActionButton['id'], mode: ActionMode | null): void {
    if (this.finished) return;

    if (mode !== null) {
      this.mode = this.mode === mode ? 'inspect' : mode;
      if (this.state) this.redraw(this.state);
      return;
    }

    const action = immediateAction(id);
    if (action) this.session.send(action);
  }

  private handleState(message: StateMessage): void {
    if (message.version !== PROTOCOL_VERSION) {
      this.statusText = 'Versão incompatível';
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
    const actor = this.actor();
    if (actor && actor.team === HUMAN_TEAM) this.selectedId = actor.id;
    this.mode = settleMode(this.mode, availableActions(message.state, HUMAN_TEAM));

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

  private actor(): UnitState | undefined {
    if (!this.state) return undefined;
    const currentId = this.state.initiative[this.state.currentIndex];
    return this.state.units.find((unit) => unit.id === currentId);
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
        this.sprites.get(cue.unitId)?.slideTo(this.placementOf(cue.from), this.placementOf(cue.to));
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
    this.statusText = 'Reconectando...';
    this.pushHud();

    // The server sends the state again once the seat is back, which clears the notice.
    if (await this.session.reconnect()) return;

    this.reconnecting = false;
    this.finish();
    this.statusText = 'Partida perdida';
    this.pushHud();
  }

  /** The match is over: clicks stop, and the way out appears. */
  private finish(): void {
    this.finished = true;
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
    this.resultText = message.winner === HUMAN_TEAM ? 'Vitória' : 'Derrota';
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
    this.hud.render({
      state: this.state,
      selectedId: this.selectedId,
      mode: this.mode,
      finished: this.finished,
      buttons: this.buttonModel,
      logLines: this.logLines,
      status: this.statusText,
      result: this.resultText,
      wayOutVisible: this.finished,
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

  /** The cells the armed mode would act on, drawn as the top face of each cell they cover. */
  private drawHighlights(state: PublicState): void {
    for (const graphic of this.highlights) graphic.destroy();
    this.highlights = [];
    if (this.mode === 'inspect') return;

    const move = this.mode === 'move';
    const color = move ? HIGHLIGHT_MOVE_COLOR : HIGHLIGHT_ATTACK_COLOR;
    const alpha = move ? HIGHLIGHT_MOVE_ALPHA : HIGHLIGHT_ATTACK_ALPHA;
    const cells = highlightedCells({
      state,
      selectedId: this.selectedId,
      mode: this.mode,
      humanTeam: HUMAN_TEAM,
    });

    for (const cell of cells) {
      const level = this.levelAt(cell);
      // A gap has no top face to wash: nothing is aimed at it and no rule ever offers it.
      if (level === NO_FLOOR) continue;

      const graphic = this.add.graphics().setDepth(depthOfCell(cell) + HIGHLIGHT_DEPTH_STEP);
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

    for (const unit of state.units) {
      if (unit.permanentlyDead) continue;
      inPlay.add(unit.id);

      let sprite = this.sprites.get(unit.id);
      if (sprite === undefined) {
        sprite = new UnitSprite(this, unit, unit.id === this.selectedId, this.placementOf(unit.position));
        this.sprites.set(unit.id, sprite);
      } else {
        sprite.sync(unit, unit.id === this.selectedId, this.placementOf(unit.position));
      }
    }

    for (const id of [...this.sprites.keys()]) {
      if (inPlay.has(id)) continue;
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
    }
  }

  /** One frame of every animation on the board. The scene decides nothing; the sprites advance. */
  update(time: number): void {
    this.mapView?.update(time);
    for (const sprite of this.sprites.values()) sprite.tick(time);
  }

}
