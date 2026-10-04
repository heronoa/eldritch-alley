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
import { unitPanel } from '../game/panel';
import { presentationOf, type Cue, type Snapshot } from '../game/presentation';
import { resolveClick } from '../game/selection';
import { turnOrder } from '../game/turn-order';
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
import type { Cell, Pixel } from '../view/grid';
import { cellAt, cellToScreen, depthOfCell, topFace } from '../view/iso';
import {
  LEGEND_RECT,
  LOG_LINES,
  LOG_RECT,
  LOG_TEXT_POINT,
  PADDING,
  PANEL_BAR_HEIGHT,
  PANEL_BAR_OFFSET,
  PANEL_RECT,
  STATUS_RECT,
  buttonIndexAt,
  buttonRect,
  carouselSlotRect,
  containsPoint,
  hudRects,
  panelRowPoint,
} from '../view/layout';
import {
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  HIGHLIGHT_ATTACK_ALPHA,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_ALPHA,
  HIGHLIGHT_MOVE_COLOR,
  PANEL_STROKE,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
} from '../view/theme';
import { BoardTiles } from './BoardTiles';
import { playEffect } from './effects';
import { BODY_HEIGHT, UnitSprite, type Placement } from './units';
import { Button, createPanel, createTurnChip } from './widgets';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';

/** The air between the result and the stamp around it. */
const STAMP_PADDING = 16;

/** How far over its own cell a highlight is drawn, so the tile under it stays visible. */
const HIGHLIGHT_DEPTH_STEP = 0.1;

/**
 * Where the HUD is drawn: over every tile (14) and every unit (14.5) of an 8x8 board, so a panel
 * floating over the board is never covered by it. The result and its stamp sit over the panels.
 */
const HUD_DEPTH = 100;

/** What the colours on the board mean, for a player who has not been told. Two lines of the column. */
const LEGEND = 'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque';

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

  private tiles!: BoardTiles;
  /** One graphic per highlighted cell, at the cell's own depth, rebuilt on every redraw. */
  private highlights: Phaser.GameObjects.Graphics[] = [];
  private chips!: Phaser.GameObjects.Container;
  private panelRows!: Phaser.GameObjects.Container;
  private buttons: Button[] = [];
  /** The model the drawn buttons came from, so a click resolves to the action the player sees. */
  private buttonModel: ActionButton[] = [];
  private logText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;
  private stamp!: Phaser.GameObjects.Graphics;

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
    this.buttons = [];
    this.buttonModel = [];
    this.highlights = [];
    this.sprites = new Map();
    this.snapshot = new Map();
  }

  create(): void {
    // Drawing order is depth here, not the order things are added: the blocks carry the depth of
    // their cell, the highlights a hair over their own cell, the units half a step further, and the
    // whole HUD floats above all of it.
    this.tiles = new BoardTiles(this, (cell) => this.levelAt(cell));

    // The frames are drawn once; the chips and the panel rows are rebuilt from the state instead.
    createPanel(this, PANEL_RECT, 'Unidade').setDepth(HUD_DEPTH);
    createPanel(this, LOG_RECT, 'Registro').setDepth(HUD_DEPTH);
    this.chips = this.add.container(0, 0).setDepth(HUD_DEPTH);
    this.panelRows = this.add.container(0, 0).setDepth(HUD_DEPTH);

    this.logText = this.add
      .text(LOG_TEXT_POINT.x, LOG_TEXT_POINT.y, '', {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.log,
        color: TEXT_COLOR,
        lineSpacing: 4,
      })
      .setDepth(HUD_DEPTH);

    this.add
      .text(LEGEND_RECT.x + PADDING, LEGEND_RECT.y + PADDING, LEGEND, {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.legend,
        color: TEXT_COLOR,
      })
      .setDepth(HUD_DEPTH);

    this.status = this.add
      .text(STATUS_RECT.x + PADDING, STATUS_RECT.y, '', {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.unit,
        color: TEXT_COLOR_ALERT,
      })
      .setDepth(HUD_DEPTH);

    this.result = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: FONT_TITLE,
        fontSize: FONT_SIZE.result,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 1);

    // The stamp is drawn over the result, so it is added after it and resized whenever it changes.
    this.stamp = this.add.graphics().setDepth(HUD_DEPTH + 2);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));

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
    if (this.finished || this.state === null) return;

    const point = { x: pointer.x, y: pointer.y };

    const buttonIndex = buttonIndexAt(point);
    if (buttonIndex !== null) {
      const button = this.buttonModel[buttonIndex];
      if (button !== undefined && button.enabled) this.pressAction(button.id, button.mode);
      return;
    }

    if (hudRects().some((rect) => containsPoint(rect, point))) return;

    const cell = cellAt(point, (candidate) => this.levelAt(candidate));
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
      this.status.setText('Versão incompatível');
      return;
    }

    this.state = message.state;
    // The state always comes after the events it caused, so what it says here is where the board
    // ends up — and every event that arrives next is read against it.
    this.snapshot = snapshotOf(message.state);

    // The acting unit is selected for the player, so the board and the panel are about the unit that
    // can actually act; the mode then falls back if the new turn has nothing left to do.
    const actor = this.actor();
    if (actor && actor.team === HUMAN_TEAM) this.selectedId = actor.id;
    this.mode = settleMode(this.mode, availableActions(message.state, HUMAN_TEAM));

    this.redraw(message.state);

    if (this.reconnecting) {
      this.reconnecting = false;
      this.status.setText('');
    }
  }

  private actor(): UnitState | undefined {
    if (!this.state) return undefined;
    const currentId = this.state.initiative[this.state.currentIndex];
    return this.state.units.find((unit) => unit.id === currentId);
  }

  /** The height of a cell, as the state carries it. Flat until the first state arrives. */
  private levelAt(cell: Cell): number {
    const board = this.state?.board;
    if (board === undefined) return 0;

    return board.levels[cell.y * board.width + cell.x];
  }

  /** Where a unit's feet rest on a cell: the centre of its top face, lifted by the cell's level. */
  private placementOf(cell: Cell): Placement {
    return { cell, anchor: cellToScreen(cell, this.levelAt(cell)) };
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
    this.logText.setText(this.logLines.join('\n'));
  }

  private async handleDrop(): Promise<void> {
    if (this.finished) return;

    this.reconnecting = true;
    this.status.setText('Reconectando...');

    // The server sends the state again once the seat is back, which clears the notice.
    if (await this.session.reconnect()) return;

    this.reconnecting = false;
    this.finished = true;
    this.status.setText('Partida perdida');
    if (this.state) this.updateActionBar(this.state);
  }

  private handleEnded(message: EndedMessage): void {
    this.finished = true;
    this.reconnecting = false;
    this.mode = 'inspect';
    this.selectedId = null;
    this.status.setText('');
    this.result.setText(message.winner === HUMAN_TEAM ? 'Vitória' : 'Derrota');
    this.drawStamp();
    if (this.state) this.redraw(this.state);
  }

  /** The stamp frame hugs whatever the result says, so it is redrawn rather than placed once. */
  private drawStamp(): void {
    this.stamp.clear();
    if (this.result.text === '') return;

    const bounds = this.result.getBounds();
    this.stamp.lineStyle(STAMP_WIDTH, STAMP_COLOR, 1);
    this.stamp.strokeRect(
      bounds.x - STAMP_PADDING,
      bounds.y - STAMP_PADDING,
      bounds.width + 2 * STAMP_PADDING,
      bounds.height + 2 * STAMP_PADDING,
    );
  }

  private redraw(state: PublicState): void {
    this.tiles.sync((cell) => this.levelAt(cell));
    this.drawHighlights(state);
    this.redrawUnits(state);
    this.redrawCarousel(state);
    this.redrawPanel(state);
    this.updateActionBar(state);
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
      const graphic = this.add.graphics().setDepth(depthOfCell(cell) + HIGHLIGHT_DEPTH_STEP);
      const face = topFace(cell, this.levelAt(cell));

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
    for (const sprite of this.sprites.values()) sprite.tick(time);
  }

  /** One chip per unit still in play, in turn order, so the queue shrinks as units fall. */
  private redrawCarousel(state: PublicState): void {
    this.chips.removeAll(true);

    turnOrder(state).forEach((slot, index) => {
      this.chips.add(createTurnChip(this, carouselSlotRect(index), slot));
    });
  }

  private redrawPanel(state: PublicState): void {
    this.panelRows.removeAll(true);

    const barWidth = PANEL_RECT.width - 2 * PADDING;
    const valueX = PANEL_RECT.x + PANEL_RECT.width - PADDING;

    unitPanel(state, this.selectedId).forEach((row, index) => {
      const point = panelRowPoint(index);
      const color = row.enabled ? TEXT_COLOR : TEXT_COLOR_DISABLED;

      const label = this.add.text(point.x, point.y, row.label, {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.log,
        color,
      });
      const value = this.add
        .text(valueX, point.y, row.value, { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color })
        .setOrigin(1, 0);
      this.panelRows.add([label, value]);

      if (row.fill === null) return;

      const barY = point.y + PANEL_BAR_OFFSET;
      const track = this.add
        .rectangle(point.x, barY, barWidth, PANEL_BAR_HEIGHT, PANEL_STROKE)
        .setOrigin(0);
      const filled = this.add
        .rectangle(point.x, barY, barWidth * row.fill, PANEL_BAR_HEIGHT, CURRENT_TURN_COLOR)
        .setOrigin(0);
      this.panelRows.add([track, filled]);
    });
  }

  /** Built once from the model, then only refreshed, because a button keeps its own visual state. */
  private updateActionBar(state: PublicState): void {
    const model = actionButtons(state, HUMAN_TEAM);
    this.buttonModel = model;

    if (this.buttons.length === 0) {
      this.buttons = model.map(
        (button, index) => new Button(this, buttonRect(index), button.label).setDepth(HUD_DEPTH),
      );
    }

    model.forEach((button, index) => {
      // A finished match disables the bar whatever the last state still says about availability.
      this.buttons[index].setEnabled(!this.finished && button.enabled);
      this.buttons[index].setSelected(button.mode !== null && button.mode === this.mode);
    });
  }
}
