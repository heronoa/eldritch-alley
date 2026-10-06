// The HUD of the match, in its own scene so the map can be zoomed underneath it without the panels
// growing. It draws what the match scene hands it and nothing else: every label, order, enabled flag and
// colour comes from the tested `game/` and `view/` modules, and it never reads the game's state itself.
import Phaser from 'phaser';
import type { ActionButton, ActionMode } from '../game/actions';
import type { AutoEndPhase } from '../game/autoEndTurn';
import { bannerFor } from '../game/banner';
import { unitPanel } from '../game/panel';
import { activeSlot, turnOrder, type TurnSlot } from '../game/turn-order';
import { t } from '../i18n';
import type { PublicState, Team } from '../protocol';
import {
  ACTION_HINT_RECT,
  BANNER_RECT,
  COUNTDOWN_LINK_RECT,
  COUNTDOWN_RECT,
  LEGEND_RECT,
  LOG_RECT,
  LOG_TEXT_POINT,
  PADDING,
  PANEL_BAR_HEIGHT,
  PANEL_BAR_OFFSET,
  PANEL_RECT,
  RESULT_BUTTON_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_TOGGLE_RECT,
  STATUS_RECT,
  buttonRect,
  carouselSlotRect,
  panelRowPoint,
  type Rect,
} from '../view/layout';
import {
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  PANEL_FILL,
  PANEL_STROKE,
  PAPER_COLOR,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
} from '../view/theme';
import { Banner, Button, createPanel, createTurnChip } from './widgets';

/** Space between the result text and the frame drawn around it. */
const STAMP_PADDING = 16;

/** How many teeth the cog of the settings has, and the two radii its rim is drawn between. */
const GEAR_TEETH = 8;
const GEAR_HUB_RADIUS = 6;
const GEAR_RIM_RADIUS = 10;

/** How big the box of the settings toggle is, and how far its label starts after it. */
const TOGGLE_BOX = 16;
const TOGGLE_LABEL_GAP = 12;

/**
 * The automatic end of turn (EA-4), as the match scene has it: the phase the countdown is in, and how
 * much of it is left. The HUD decides nothing about it — it is handed the phase and draws it.
 */
export interface AutoEndView {
  phase: AutoEndPhase;
  /** Whole seconds left of the countdown, rounded up, which is all the player is told. */
  seconds: number;
  /** Whether the turn passes on its own, which is what the settings toggle shows. */
  enabled: boolean;
}

/** Everything the HUD shows at one moment, as the match scene knows it. */
export interface HudView {
  state: PublicState | null;
  /** The side the person at the keyboard plays, which is what the turn banner names. */
  humanTeam: Team;
  selectedId: string | null;
  mode: ActionMode;
  finished: boolean;
  buttons: readonly ActionButton[];
  logLines: readonly string[];
  status: string;
  result: string;
  /** Whether the way out of a finished match is on the screen, and whether the settings panel is. */
  wayOutVisible: boolean;
  settingsOpen: boolean;
  autoEndTurn: AutoEndView;
}

const EMPTY_VIEW: HudView = {
  state: null,
  humanTeam: 'A',
  selectedId: null,
  mode: 'inspect',
  finished: false,
  buttons: [],
  logLines: [],
  status: '',
  result: '',
  wayOutVisible: false,
  settingsOpen: false,
  autoEndTurn: { phase: 'idle', seconds: 0, enabled: true },
};

export class HudScene extends Phaser.Scene {
  /** The last view handed over. It is kept so a view given before `create` is shown once it runs. */
  private view: HudView = EMPTY_VIEW;
  private built = false;

  private chips!: Phaser.GameObjects.Container;
  private panelRows!: Phaser.GameObjects.Container;
  private banner!: Banner;
  /**
   * The unit the last drawn state had on turn, so the HUD can tell a hand-over from a redraw of the
   * same turn. Nothing else of the view is remembered.
   */
  private lastActive: TurnSlot | null = null;
  private buttons: Button[] = [];
  private logText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;
  private stamp!: Phaser.GameObjects.Graphics;
  private wayOut!: Button;

  /** The settings of the match (EA-4): the gear, the panel it opens, and the row inside it. */
  private settingsButton!: Button;
  private settingsPanel!: Phaser.GameObjects.Container;
  private settingsRows!: Phaser.GameObjects.Container;
  /** The countdown of the automatic end of turn, the link under it, and the hint the button gives. */
  private countdown!: Phaser.GameObjects.Text;
  private countdownLink!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(): void {
    createPanel(this, PANEL_RECT, t('hud.panel.unit'));
    createPanel(this, LOG_RECT, t('hud.panel.log'));
    this.chips = this.add.container(0, 0);
    this.panelRows = this.add.container(0, 0);

    this.logText = this.add.text(LOG_TEXT_POINT.x, LOG_TEXT_POINT.y, '', {
      fontFamily: FONT_BODY,
      fontSize: FONT_SIZE.log,
      color: TEXT_COLOR,
      lineSpacing: 4,
    });

    // What the legend says about the colours on the board, for a player who has not been told.
    this.add.text(LEGEND_RECT.x + PADDING, LEGEND_RECT.y + PADDING, t('hud.legend'), {
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

    this.wayOut = new Button(this, RESULT_BUTTON_RECT, t('hud.back')).setVisible(false);

    // The settings (EA-4, decision D3): a gear in the corner, and the one option it opens. The cog is
    // added over its button, so the button's own frame reads as the thing to press.
    this.settingsButton = new Button(this, SETTINGS_BUTTON_RECT, '');
    this.drawGear();
    this.settingsPanel = createPanel(this, SETTINGS_PANEL_RECT, t('hud.settings')).setVisible(false);
    this.settingsRows = this.add.container(0, 0);

    // The countdown of the automatic end of turn, over the board under the banner: the seconds left,
    // the way out of the countdown, the way out of the feature, and the hint the button gives when
    // the feature is off. None of them is shown until the machine is in the phase that shows it.
    this.countdown = this.centredLine(COUNTDOWN_RECT, FONT_SIZE.unit, TEXT_COLOR).setVisible(false);
    this.countdownLink = this.centredLine(COUNTDOWN_LINK_RECT, FONT_SIZE.log, TEXT_COLOR_DISABLED)
      .setText(t('hud.autoEndTurn.link'))
      .setVisible(false);
    this.hint = this.centredLine(ACTION_HINT_RECT, FONT_SIZE.log, TEXT_COLOR)
      .setText(t('hud.autoEndTurn.hint'))
      .setVisible(false);

    // Added last: a turn change floats over the panels, and it is gone before the next one comes.
    this.banner = new Banner(this, BANNER_RECT);

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
    this.lastActive = null;
    this.built = false;
  }

  private apply(view: HudView): void {
    this.drawChips(view.state);
    this.drawPanel(view.state, view.selectedId);
    this.drawButtons(view);
    this.drawSettings(view);
    this.drawAutoEndTurn(view);
    this.drawBanner(view);

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

  /**
   * The banner of a turn change (EA-3). The HUD is handed a whole state on every redraw, including
   * the ones a log line raises, so the unit on turn is compared with the one of the last state and
   * only a real hand-over — or the opening state of the match — raises a banner.
   */
  private drawBanner(view: HudView): void {
    if (view.state === null) return;

    const current = activeSlot(view.state);
    const banner = bannerFor(this.lastActive, current, view.humanTeam);
    this.lastActive = current;

    if (banner !== null) this.banner.show(banner.text, banner.durationMs);
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
      // The hint of the automatic end of turn: with the feature off and nothing left to do, the
      // button breathes instead of being pressed for the player (EA-4).
      shown.setHinting(button.id === 'endTurn' && view.autoEndTurn.phase === 'hinting');
    });
  }

  /**
   * The settings (EA-4, decision D3). The panel is built once and only shown or hidden, because it
   * holds no state of its own; the single row inside it is rebuilt on every view, because the tick of
   * the toggle is that state.
   */
  private drawSettings(view: HudView): void {
    this.settingsButton.setSelected(view.settingsOpen);
    this.settingsPanel.setVisible(view.settingsOpen);

    this.settingsRows.removeAll(true);
    if (!view.settingsOpen) return;

    const box = this.add
      .rectangle(
        SETTINGS_TOGGLE_RECT.x,
        SETTINGS_TOGGLE_RECT.y + (SETTINGS_TOGGLE_RECT.height - TOGGLE_BOX) / 2,
        TOGGLE_BOX,
        TOGGLE_BOX,
        view.autoEndTurn.enabled ? PAPER_COLOR : PANEL_FILL,
      )
      .setOrigin(0)
      .setStrokeStyle(1, PANEL_STROKE);

    const label = this.add
      .text(
        SETTINGS_TOGGLE_RECT.x + TOGGLE_BOX + TOGGLE_LABEL_GAP,
        SETTINGS_TOGGLE_RECT.y + SETTINGS_TOGGLE_RECT.height / 2,
        t('hud.settings.autoEndTurn'),
        { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color: TEXT_COLOR },
      )
      .setOrigin(0, 0.5);

    this.settingsRows.add([box, label]);
  }

  /**
   * The automatic end of turn (EA-4): the countdown and the two ways out of it while it runs, and the
   * hint over the bar when the player has turned the feature off. The line is only written when the
   * scene hands over a new second, so the countdown costs one redraw per second and not one per frame.
   */
  private drawAutoEndTurn(view: HudView): void {
    const counting = view.autoEndTurn.phase === 'counting';
    if (counting) {
      this.countdown.setText(t('hud.autoEndTurn.countdown', { seconds: view.autoEndTurn.seconds }));
    }

    this.countdown.setVisible(counting);
    this.countdownLink.setVisible(counting);
    this.hint.setVisible(view.autoEndTurn.phase === 'hinting');
  }

  /**
   * The cog of the settings button. It is drawn from a rim and its teeth rather than lettered:
   * neither face the HUD carries has a cog in it, and a glyph borrowed from whatever font the machine
   * happens to have would be the one thing on the screen in another typeface.
   */
  private drawGear(): void {
    const centre = {
      x: SETTINGS_BUTTON_RECT.x + SETTINGS_BUTTON_RECT.width / 2,
      y: SETTINGS_BUTTON_RECT.y + SETTINGS_BUTTON_RECT.height / 2,
    };
    const gear = this.add.graphics();
    gear.lineStyle(3, PAPER_COLOR, 1);
    gear.strokeCircle(centre.x, centre.y, GEAR_HUB_RADIUS);

    for (let tooth = 0; tooth < GEAR_TEETH; tooth += 1) {
      const angle = (tooth / GEAR_TEETH) * Math.PI * 2;
      gear.lineBetween(
        centre.x + Math.cos(angle) * GEAR_HUB_RADIUS,
        centre.y + Math.sin(angle) * GEAR_HUB_RADIUS,
        centre.x + Math.cos(angle) * GEAR_RIM_RADIUS,
        centre.y + Math.sin(angle) * GEAR_RIM_RADIUS,
      );
    }
  }

  /** One line of text centred on a rectangle of the HUD: the countdown, its link, and the hint. */
  private centredLine(rect: Rect, fontSize: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(rect.x + rect.width / 2, rect.y + rect.height / 2, '', {
        fontFamily: FONT_TITLE,
        fontSize,
        color,
      })
      .setOrigin(0.5);
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
