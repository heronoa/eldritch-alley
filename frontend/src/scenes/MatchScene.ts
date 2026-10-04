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
import { ORIGIN, TILE_SIZE, cellToPixel, heightColor, pixelToCell } from '../view/grid';
import {
  LEGEND_Y,
  LOG_LINES,
  LOG_RECT,
  LOG_TEXT_POINT,
  PADDING,
  PANEL_BAR_HEIGHT,
  PANEL_BAR_OFFSET,
  PANEL_RECT,
  STATUS_Y,
  buttonIndexAt,
  buttonRect,
  carouselSlotRect,
  panelRowPoint,
} from '../view/layout';
import {
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  GRID_STROKE_COLOR,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_COLOR,
  PANEL_STROKE,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
} from '../view/theme';
import { playEffect } from './effects';
import { UnitSprite } from './units';
import { Button, createPanel, createTurnChip } from './widgets';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';

/** How solid a highlighted cell is: enough to read, thin enough to leave the tile colour visible. */
const HIGHLIGHT_ALPHA = 0.35;

/** The air between the result and the stamp around it. */
const STAMP_PADDING = 16;

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

  private grid!: Phaser.GameObjects.Graphics;
  private highlights!: Phaser.GameObjects.Graphics;
  private units!: Phaser.GameObjects.Container;
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
    this.sprites = new Map();
    this.snapshot = new Map();
  }

  create(): void {
    // Drawing order is the order the objects are added: the board, the highlight over it, the pieces,
    // then the sidebar.
    this.grid = this.add.graphics();
    this.highlights = this.add.graphics();
    this.units = this.add.container(0, 0);

    // The frames are drawn once; the chips and the panel rows are rebuilt from the state instead.
    createPanel(this, PANEL_RECT, 'Unidade');
    createPanel(this, LOG_RECT, 'Registro');
    this.chips = this.add.container(0, 0);
    this.panelRows = this.add.container(0, 0);

    this.logText = this.add.text(LOG_TEXT_POINT.x, LOG_TEXT_POINT.y, '', {
      fontFamily: FONT_BODY,
      fontSize: FONT_SIZE.log,
      color: TEXT_COLOR,
      lineSpacing: 4,
    });

    this.add.text(ORIGIN.x, LEGEND_Y, LEGEND, {
      fontFamily: FONT_BODY,
      fontSize: FONT_SIZE.legend,
      color: TEXT_COLOR,
    });

    this.status = this.add.text(ORIGIN.x, STATUS_Y, '', {
      fontFamily: FONT_BODY,
      fontSize: FONT_SIZE.unit,
      color: TEXT_COLOR_ALERT,
    });

    this.result = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: FONT_TITLE,
        fontSize: FONT_SIZE.result,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    // The stamp is drawn over the result, so it is added after it and resized whenever it changes.
    this.stamp = this.add.graphics();

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
   * The action bar is tested first, against the same rectangle that draws each button, so a click on
   * a button never reaches the board (DT-30). What a board click means is decided by `resolveClick`,
   * narrowed by `applyMode`; the server decides the rest.
   */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.finished || this.state === null) return;

    const buttonIndex = buttonIndexAt({ x: pointer.x, y: pointer.y });
    if (buttonIndex !== null) {
      const button = this.buttonModel[buttonIndex];
      if (button !== undefined && button.enabled) this.pressAction(button.id, button.mode);
      return;
    }

    const cell = pixelToCell({ x: pointer.x, y: pointer.y });
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
        this.sprites.get(cue.unitId)?.slideTo(cellToPixel(cue.from), cellToPixel(cue.to));
        break;

      case 'attack': {
        const actor = this.sprites.get(cue.actorId);
        const target = this.sprites.get(cue.targetId);
        if (actor === undefined || target === undefined) break;

        // The effect is thrown from where the two units are drawn, so it reads even mid-move.
        const from = { x: actor.x, y: actor.y };
        const to = { x: target.x, y: target.y };
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
    this.drawGrid(state);
    this.drawHighlights(state);
    this.redrawUnits(state);
    this.redrawCarousel(state);
    this.redrawPanel(state);
    this.updateActionBar(state);
  }

  private drawGrid(state: PublicState): void {
    this.grid.clear();
    for (let y = 0; y < state.board.height; y += 1) {
      for (let x = 0; x < state.board.width; x += 1) {
        const corner = cellToPixel({ x, y });
        this.grid.fillStyle(heightColor(state.board.levels[y * state.board.width + x]), 1);
        this.grid.fillRect(corner.x, corner.y, TILE_SIZE, TILE_SIZE);
        this.grid.lineStyle(1, GRID_STROKE_COLOR, 1);
        this.grid.strokeRect(corner.x, corner.y, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  /** The cells the armed mode would act on, over the grid and under the pieces. */
  private drawHighlights(state: PublicState): void {
    this.highlights.clear();
    if (this.mode === 'inspect') return;

    const color = this.mode === 'move' ? HIGHLIGHT_MOVE_COLOR : HIGHLIGHT_ATTACK_COLOR;
    const cells = highlightedCells({
      state,
      selectedId: this.selectedId,
      mode: this.mode,
      humanTeam: HUMAN_TEAM,
    });

    this.highlights.fillStyle(color, HIGHLIGHT_ALPHA);
    this.highlights.lineStyle(2, color, 1);
    for (const cell of cells) {
      const corner = cellToPixel(cell);
      this.highlights.fillRect(corner.x, corner.y, TILE_SIZE, TILE_SIZE);
      this.highlights.strokeRect(corner.x, corner.y, TILE_SIZE, TILE_SIZE);
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
        sprite = new UnitSprite(this, unit, unit.id === this.selectedId, cellToPixel(unit.position));
        this.sprites.set(unit.id, sprite);
        this.units.add(sprite);
      } else {
        sprite.sync(unit, unit.id === this.selectedId, cellToPixel(unit.position));
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
      this.buttons = model.map((button, index) => new Button(this, buttonRect(index), button.label));
    }

    model.forEach((button, index) => {
      // A finished match disables the bar whatever the last state still says about availability.
      this.buttons[index].setEnabled(!this.finished && button.enabled);
      this.buttons[index].setSelected(button.mode !== null && button.mode === this.mode);
    });
  }
}
