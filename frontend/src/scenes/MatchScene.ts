// The match: draws the public state, turns clicks into actions, and shows what the server answers.
// It decides nothing on its own — every rule lives on the server.
import Phaser from 'phaser';
import { describeEvent, type UnitNames } from '../game/log';
import { resolveClick } from '../game/selection';
import { Session } from '../net/session';
import {
  PROTOCOL_VERSION,
  type EndedMessage,
  type PublicState,
  type StateMessage,
  type Team,
  type UnitState,
} from '../protocol';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  ORIGIN,
  TILE_SIZE,
  cellToPixel,
  heightColor,
  pixelToCell,
} from '../view/grid';
import { FONT, FONT_SIZE, TEAM_COLOR, TEXT_COLOR } from '../view/theme';

/** The side the person at the keyboard plays. */
const HUMAN_TEAM: Team = 'A';

/** Side of the unit rectangle drawn inside a tile. */
const UNIT_SIZE = 36;

/** A unit that fell keeps its tile, greyed out, until the body is removed. */
const CORPSE_COLOR = 0x4a4a4a;
const SELECTED_COLOR = 0xffd166;
const GRID_STROKE_COLOR = 0x000000;

/** The log panel sits to the right of the board; the legend and the status line go under it. */
const LOG_X = ORIGIN.x + BOARD_WIDTH * TILE_SIZE + 16;
const LOG_Y = ORIGIN.y;
const LOG_LINES = 8;
const LEGEND_Y = ORIGIN.y + BOARD_HEIGHT * TILE_SIZE + 16;
const STATUS_Y = LEGEND_Y + 24;

/** What the colours on the board mean, for a player who has not been told. */
const LEGEND = 'Azul claro: você · Escuro: bot · Amarelo: selecionado';

/** The state carries no display name for a unit, so the log falls back to the id. */
const UNIT_NAMES: UnitNames = {};

function fillColorOf(unit: UnitState): number {
  return unit.defeated ? CORPSE_COLOR : TEAM_COLOR[unit.team];
}

/** Sniper, wizard, priest — the first letter of the class names the piece on the board. */
function initialOf(unit: UnitState): string {
  return unit.primaryClass.charAt(0).toUpperCase();
}

export class MatchScene extends Phaser.Scene {
  private session!: Session;
  private state: PublicState | null = null;
  private selectedId: string | null = null;
  private logLines: string[] = [];
  /** Set when the match is over or lost, after which clicks are ignored. */
  private finished = false;
  /** True while waiting for a reconnection, so the first state that arrives can clear the notice. */
  private reconnecting = false;

  private grid!: Phaser.GameObjects.Graphics;
  private units!: Phaser.GameObjects.Container;
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
    this.logLines = [];
    this.finished = false;
    this.reconnecting = false;
  }

  create(): void {
    // Drawing order is the order the objects are added: board, then units, then the panels.
    this.grid = this.add.graphics();
    this.units = this.add.container(0, 0);

    this.logText = this.add.text(LOG_X, LOG_Y, '', {
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
      fontSize: '16px',
      color: '#e0b050',
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
    this.session.onRejected((message) => this.appendLog(message.reason));
    this.session.onEnded((message) => this.handleEnded(message));
    this.session.onDrop(() => {
      void this.handleDrop();
    });
  }

  /** What the click means is decided by `resolveClick`; the server still has the last word. */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.finished || this.state === null) return;

    const cell = pixelToCell({ x: pointer.x, y: pointer.y });
    if (cell === null) return;

    const intent = resolveClick({
      state: this.state,
      selectedId: this.selectedId,
      cell,
      humanTeam: HUMAN_TEAM,
    });

    switch (intent.kind) {
      case 'select':
        this.selectedId = intent.unitId;
        this.redrawUnits(this.state);
        break;
      case 'send':
        this.session.send(intent.action);
        break;
      case 'move-preview':
      case 'none':
        break;
    }
  }

  private handleState(message: StateMessage): void {
    if (message.version !== PROTOCOL_VERSION) {
      this.status.setText('Versão incompatível');
      return;
    }

    this.state = message.state;
    this.drawGrid(message.state);
    this.redrawUnits(message.state);

    if (this.reconnecting) {
      this.reconnecting = false;
      this.status.setText('');
    }
  }

  /** A rejected action changes nothing: the state and the selection stay as they were. */
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
  }

  private handleEnded(message: EndedMessage): void {
    this.finished = true;
    this.reconnecting = false;
    this.status.setText('');
    this.result.setText(message.winner === HUMAN_TEAM ? 'Vitória' : 'Derrota');
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

  private redrawUnits(state: PublicState): void {
    this.units.removeAll(true);

    for (const unit of state.units) {
      const corner = cellToPixel(unit.position);
      const centreX = corner.x + TILE_SIZE / 2;
      const centreY = corner.y + TILE_SIZE / 2;

      const body = this.add.rectangle(centreX, centreY, UNIT_SIZE, UNIT_SIZE, fillColorOf(unit));
      if (unit.id === this.selectedId) body.setStrokeStyle(3, SELECTED_COLOR);

      const initial = this.add
        .text(centreX, centreY, initialOf(unit), {
          fontFamily: FONT,
          fontSize: FONT_SIZE.unit,
          color: TEXT_COLOR,
        })
        .setOrigin(0.5);

      this.units.add([body, initial]);
    }
  }
}
