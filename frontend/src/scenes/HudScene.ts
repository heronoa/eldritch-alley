// The HUD of the match, in its own scene so the map can be zoomed underneath it without the panels
// growing. It draws what the match scene hands it and nothing else: every label, order, enabled flag and
// colour comes from the tested `game/` and `view/` modules, and it never reads the game's state itself.
import Phaser from 'phaser';
import type { ActionButton, ActionMode } from '../game/actions';
import { unitPanel } from '../game/panel';
import { turnOrder } from '../game/turn-order';
import type { PublicState } from '../protocol';
import {
  LEGEND_RECT,
  LOG_RECT,
  LOG_TEXT_POINT,
  PADDING,
  PANEL_BAR_HEIGHT,
  PANEL_BAR_OFFSET,
  PANEL_RECT,
  RESULT_BUTTON_RECT,
  STATUS_RECT,
  buttonRect,
  carouselSlotRect,
  panelRowPoint,
} from '../view/layout';
import {
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  PANEL_STROKE,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
} from '../view/theme';
import { Button, createPanel, createTurnChip } from './widgets';

/** Space between the result text and the frame drawn around it. */
const STAMP_PADDING = 16;

/** What the legend says about the colours on the board, for a player who has not been told. */
const LEGEND = 'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque';

/** Everything the HUD shows at one moment, as the match scene knows it. */
export interface HudView {
  state: PublicState | null;
  selectedId: string | null;
  mode: ActionMode;
  finished: boolean;
  buttons: readonly ActionButton[];
  logLines: readonly string[];
  status: string;
  result: string;
  wayOutVisible: boolean;
}

const EMPTY_VIEW: HudView = {
  state: null,
  selectedId: null,
  mode: 'inspect',
  finished: false,
  buttons: [],
  logLines: [],
  status: '',
  result: '',
  wayOutVisible: false,
};

export class HudScene extends Phaser.Scene {
  /** The last view handed over. It is kept so a view given before `create` is shown once it runs. */
  private view: HudView = EMPTY_VIEW;
  private built = false;

  private chips!: Phaser.GameObjects.Container;
  private panelRows!: Phaser.GameObjects.Container;
  private buttons: Button[] = [];
  private logText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;
  private stamp!: Phaser.GameObjects.Graphics;
  private wayOut!: Button;

  constructor() {
    super('hud');
  }

  create(): void {
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

    this.add.text(LEGEND_RECT.x + PADDING, LEGEND_RECT.y + PADDING, LEGEND, {
      fontFamily: FONT_BODY,
      fontSize: FONT_SIZE.legend,
      color: TEXT_COLOR,
    });

    this.status = this.add.text(STATUS_RECT.x + PADDING, STATUS_RECT.y, '', {
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

    this.wayOut = new Button(this, RESULT_BUTTON_RECT, 'Voltar ao início').setVisible(false);

    this.built = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.apply(this.view);
  }

  /** Shows the view. Before `create` the view is only kept, and shown once the scene is built. */
  render(view: HudView): void {
    this.view = view;
    if (this.built) this.apply(view);
  }

  /** A stopped HUD takes its objects with it, so the next match starts from nothing. */
  private teardown(): void {
    this.children.removeAll(true);
    this.buttons = [];
    this.built = false;
  }

  private apply(view: HudView): void {
    this.drawChips(view.state);
    this.drawPanel(view.state, view.selectedId);
    this.drawButtons(view);

    this.logText.setText(view.logLines.join('\n'));
    this.status.setText(view.status);
    this.result.setText(view.result);
    this.drawStamp();
    this.wayOut.setVisible(view.wayOutVisible);
  }

  /** One chip per unit still in play, in turn order, so the queue shrinks as units fall. */
  private drawChips(state: PublicState | null): void {
    this.chips.removeAll(true);
    if (state === null) return;

    turnOrder(state).forEach((slot, index) => {
      this.chips.add(createTurnChip(this, carouselSlotRect(index), slot));
    });
  }

  private drawPanel(state: PublicState | null, selectedId: string | null): void {
    this.panelRows.removeAll(true);
    if (state === null) return;

    const barWidth = PANEL_RECT.width - 2 * PADDING;
    const valueX = PANEL_RECT.x + PANEL_RECT.width - PADDING;

    unitPanel(state, selectedId).forEach((row, index) => {
      const rowPoint = panelRowPoint(index);
      const color = row.enabled ? TEXT_COLOR : TEXT_COLOR_DISABLED;

      const label = this.add.text(rowPoint.x, rowPoint.y, row.label, {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.log,
        color,
      });
      const value = this.add
        .text(valueX, rowPoint.y, row.value, { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color })
        .setOrigin(1, 0);
      this.panelRows.add([label, value]);

      if (row.fill === null) return;

      const barY = rowPoint.y + PANEL_BAR_OFFSET;
      const track = this.add.rectangle(rowPoint.x, barY, barWidth, PANEL_BAR_HEIGHT, PANEL_STROKE).setOrigin(0);
      const filled = this.add
        .rectangle(rowPoint.x, barY, barWidth * row.fill, PANEL_BAR_HEIGHT, CURRENT_TURN_COLOR)
        .setOrigin(0);
      this.panelRows.add([track, filled]);
    });
  }

  /** Built once, then only refreshed, because a button keeps its own visual state. */
  private drawButtons(view: HudView): void {
    if (this.buttons.length === 0) {
      this.buttons = view.buttons.map((button, index) => new Button(this, buttonRect(index), button.label));
    }

    view.buttons.forEach((button, index) => {
      const shown = this.buttons[index];
      if (shown === undefined) return;
      // A finished match disables the bar whatever the last state still says about availability.
      shown.setEnabled(!view.finished && button.enabled);
      shown.setSelected(button.mode !== null && button.mode === view.mode);
    });
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
}
