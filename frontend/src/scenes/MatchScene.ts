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
import { resolveClick } from '../game/selection';
import { turnOrder } from '../game/turn-order';
import { Session } from '../net/session';
import {
  PROTOCOL_VERSION,
  type ClientAction,
  type EndedMessage,
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
  buttonRect,
  carouselSlotRect,
  panelRowPoint,
} from '../view/layout';
import {
  CURRENT_TURN_COLOR,
  FONT,
  FONT_SIZE,
  GRID_STROKE_COLOR,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_COLOR,
  PANEL_STROKE,
  SELECTED_COLOR,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
  cssColor,
  labelColorOn,
} from '../view/theme';
import { Button, createPanel, createTurnChip, fillColorOf, initialOf } from './widgets';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';

/** Side of the unit rectangle drawn inside a tile. */
const UNIT_SIZE = 36;

/** How solid a highlighted cell is: enough to read, thin enough to leave the tile colour visible. */
const HIGHLIGHT_ALPHA = 0.35;

/** What the colours on the board mean, for a player who has not been told. Two lines of the column. */
const LEGEND = 'Azul claro: você · Escuro: bot · Amarelo: selecionado\nRealce azul: movimento · Realce vermelho: ataque';

/** The state carries no display name for a unit, so the log falls back to the id. */
const UNIT_NAMES: UnitNames = {};

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

  private grid!: Phaser.GameObjects.Graphics;
  private highlights!: Phaser.GameObjects.Graphics;
  private units!: Phaser.GameObjects.Container;
  private chips!: Phaser.GameObjects.Container;
  private panelRows!: Phaser.GameObjects.Container;
  private buttons: Button[] = [];
  private logText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;

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
      fontFamily: FONT,
      fontSize: FONT_SIZE.log,
      color: TEXT_COLOR,
      lineSpacing: 4,
    });

    this.add.text(ORIGIN.x, LEGEND_Y, LEGEND, {
      fontFamily: FONT,
      fontSize: FONT_SIZE.log,
      color: TEXT_COLOR,
    });

    this.status = this.add.text(ORIGIN.x, STATUS_Y, '', {
      fontFamily: FONT,
      fontSize: FONT_SIZE.unit,
      color: TEXT_COLOR_ALERT,
    });

    this.result = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: FONT,
        fontSize: '48px',
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));

    this.session.onState((message) => this.handleState(message));
    this.session.onEvents((events) => {
      for (const event of events) this.appendLog(describeEvent(event, UNIT_NAMES));
    });
    this.session.onRejected((message) => this.appendLog(describeRejection(message.reason)));
    this.session.onEnded((message) => this.handleEnded(message));
    this.session.onDrop(() => {
      void this.handleDrop();
    });
  }

  /** What the click means is decided by `resolveClick`, narrowed by `applyMode`; the server decides. */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.finished || this.state === null) return;

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
    if (this.state) this.redraw(this.state);
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

  private redrawUnits(state: PublicState): void {
    this.units.removeAll(true);

    for (const unit of state.units) {
      const corner = cellToPixel(unit.position);
      const centreX = corner.x + TILE_SIZE / 2;
      const centreY = corner.y + TILE_SIZE / 2;

      const fill = fillColorOf(unit);
      const body = this.add.rectangle(centreX, centreY, UNIT_SIZE, UNIT_SIZE, fill);
      if (unit.id === this.selectedId) body.setStrokeStyle(3, SELECTED_COLOR);

      // The letter takes the colour that reads on the fill it sits on, so a piece is never a smudge.
      const initial = this.add
        .text(centreX, centreY, initialOf(unit), {
          fontFamily: FONT,
          fontSize: FONT_SIZE.unit,
          color: cssColor(labelColorOn(fill)),
        })
        .setOrigin(0.5);

      this.units.add([body, initial]);
    }
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
        fontFamily: FONT,
        fontSize: FONT_SIZE.log,
        color,
      });
      const value = this.add
        .text(valueX, point.y, row.value, { fontFamily: FONT, fontSize: FONT_SIZE.log, color })
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

    if (this.buttons.length === 0) {
      this.buttons = model.map(
        (button, index) =>
          new Button(this, buttonRect(index), button.label, () =>
            this.pressAction(button.id, button.mode),
          ),
      );
    }

    model.forEach((button, index) => {
      // A finished match disables the bar whatever the last state still says about availability.
      this.buttons[index].setEnabled(!this.finished && button.enabled);
      this.buttons[index].setSelected(button.mode !== null && button.mode === this.mode);
    });
  }
}
