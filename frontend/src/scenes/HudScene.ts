// The HUD of the match, in its own scene so the map can be zoomed underneath it without the panels
// growing. It draws what the match scene hands it and nothing else: every label, order, enabled flag and
// colour comes from the tested `game/` and `view/` modules, and it never reads the game's state itself.
import Phaser from 'phaser';
import type { ActionButton, ActionMode, MoveChip } from '../game/actions';
import type { AutoEndPhase } from '../game/autoEndTurn';
import { bannerFor } from '../game/banner';
import { unitSheet } from '../game/inspect-window';
import { unitPanel, type PanelRow } from '../game/panel';
import { activeSlot, turnOrder, type TurnSlot } from '../game/turn-order';
import { t } from '../i18n';
import type { PublicState, Team } from '../protocol';
import { MIN_ZOOM } from '../view/camera-math';
import {
  ACTION_HINT_RECT,
  BANNER_RECT,
  CAMERA_CONTROLS,
  CAMERA_RECT,
  CAMERA_VIEW_RECT,
  CAMERA_ZOOM_RECT,
  COUNTDOWN_LINK_RECT,
  COUNTDOWN_RECT,
  LEGEND_RECT,
  LOG_RECT,
  LOG_TEXT_POINT,
  LOG_TOGGLE_POINT,
  CELL_BAR_HEIGHT,
  DASHBOARD_AMMO_RECT,
  DASHBOARD_HEALTH_RECT,
  DASHBOARD_RECT,
  DASHBOARD_TURN_POINT,
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  INSPECT_VALUE_X,
  PADDING,
  RESULT_BUTTON_RECT,
  SETTINGS_BUTTON_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_TOGGLE_RECT,
  STATUS_RECT,
  buttonRect,
  cameraControlRect,
  carouselSlotRect,
  cellBarPoint,
  cellBarWidth,
  cellLabelPoint,
  cellValuePoint,
  inspectRowPoint,
  logRect,
  moveChipRect,
  type CameraControl,
  type Rect,
} from '../view/layout';
import type { ViewDirection } from '../view/rotation';
import {
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  PANEL_FILL,
  PANEL_INNER_STROKE,
  PANEL_STROKE,
  PAPER_COLOR,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
} from '../view/theme';
import { Banner, Button, OVERLAY_PANEL, createPanel, createTurnChip } from './widgets';

/** Space between the result text and the frame drawn around it. */
const STAMP_PADDING = 16;

/** How many teeth the cog of the settings has, and the two radii its rim is drawn between. */
const GEAR_TEETH = 8;
const GEAR_HUB_RADIUS = 6;
const GEAR_RIM_RADIUS = 10;

/** What the button that closes the inspection window carries. A mark, so it has no catalog entry. */
const INSPECT_CLOSE_LABEL = 'X';

/** Half the width of the chevron in the log's header, and how far its point reaches from the middle. */
const LOG_CHEVRON = { halfWidth: 7, height: 5 };

/** How big the box of the settings toggle is, and how far its label starts after it. */
const TOGGLE_BOX = 16;
const TOGGLE_LABEL_GAP = 12;

/** The radius of the arrow bent round on a rotation button, and of the two circles of the centre mark. */
const ROTATE_RADIUS = 8;
const CENTRE_RIM_RADIUS = 9;
const CENTRE_DOT_RADIUS = 3;

/**
 * What each control of the camera panel is lettered with. Only the two zoom signs are letters at all;
 * the rotation buttons and the centre mark are drawn, for the same reason as the cog of the settings:
 * neither face the HUD carries has those glyphs in it.
 */
const CAMERA_LABELS: Record<CameraControl, string> = {
  rotateLeft: '',
  rotateRight: '',
  zoomIn: '+',
  zoomOut: '−',
  centre: '',
};

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
  /** The unit whose sheet is open in the inspection window, or null while there is none. */
  inspectedId: string | null;
  mode: ActionMode;
  finished: boolean;
  buttons: readonly ActionButton[];
  /** The two controls of a pending move, drawn over the board above the Move button (EA-5, D6). */
  moveChips: readonly MoveChip[];
  logLines: readonly string[];
  /** Whether the log shows every line it keeps, or only its header and the last one (Q3). */
  logOpen: boolean;
  status: string;
  result: string;
  /** Whether the way out of a finished match is on the screen, and whether the settings panel is. */
  wayOutVisible: boolean;
  settingsOpen: boolean;
  autoEndTurn: AutoEndView;
  /** Where the map camera is, as the camera panel prints it (EA-12). */
  camera: CameraPanelView;
}

/** The camera panel reads the camera: the view it looks from, and the zoom step it is on. */
export interface CameraPanelView {
  view: ViewDirection;
  /** A whole step, 1 to 4, which is what the panel prints. */
  zoom: number;
}

const EMPTY_VIEW: HudView = {
  state: null,
  humanTeam: 'A',
  selectedId: null,
  inspectedId: null,
  mode: 'inspect',
  finished: false,
  buttons: [],
  moveChips: [],
  logLines: [],
  logOpen: false,
  status: '',
  result: '',
  wayOutVisible: false,
  settingsOpen: false,
  autoEndTurn: { phase: 'idle', seconds: 0, enabled: true },
  camera: { view: 'north', zoom: MIN_ZOOM },
};

export class HudScene extends Phaser.Scene {
  /** The last view handed over. It is kept so a view given before `create` is shown once it runs. */
  private view: HudView = EMPTY_VIEW;
  private built = false;

  private chips!: Phaser.GameObjects.Container;
  private panelRows!: Phaser.GameObjects.Container;
  /** The inspection window: its frame, the X that closes it, and the rows drawn inside it. */
  private inspectPanel!: Phaser.GameObjects.Container;
  private inspectClose!: Button;
  private inspectRows!: Phaser.GameObjects.Container;
  private banner!: Banner;
  /**
   * The unit the last drawn state had on turn, so the HUD can tell a hand-over from a redraw of the
   * same turn. Nothing else of the view is remembered.
   */
  private lastActive: TurnSlot | null = null;
  private buttons: Button[] = [];
  /** The two controls of a pending move, rebuilt on every view because they come and go. */
  private moveChipButtons: Button[] = [];
  private logText!: Phaser.GameObjects.Text;
  /**
   * The box of the log, drawn once and resized on every view: it is as tall as it is open, which a
   * panel built from a fixed rectangle cannot follow.
   */
  private logFrame!: Phaser.GameObjects.Rectangle;
  private logInner!: Phaser.GameObjects.Graphics;
  /** The chevron of the header, saying whether the box is open. */
  private logMark!: Phaser.GameObjects.Graphics;
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

  /**
   * The camera panel (EA-12): its controls, and the two labels the match scene moves. The buttons are
   * built once because none of them comes and goes; only the view and the zoom step are written again.
   */
  private cameraButtons: Button[] = [];
  private cameraView!: Phaser.GameObjects.Text;
  private cameraZoom!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  create(): void {
    // The dashboard carries no title: the line under its buttons says what every part of it is, and a
    // heading over a band the player reads at a glance would only take room from the numbers.
    createPanel(this, DASHBOARD_RECT, '');
    this.createLog();
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

    // The camera panel (EA-12), under the log against the right edge. Its controls are always there
    // and always usable, so they are built here and never again; the two marks that are not letters
    // are drawn over their own buttons, the way the cog is drawn over the gear's.
    createPanel(this, CAMERA_RECT, t('hud.camera'));
    this.cameraButtons = (Object.keys(CAMERA_CONTROLS) as CameraControl[]).map(
      (control) => new Button(this, cameraControlRect(control), CAMERA_LABELS[control]),
    );
    this.drawRotateArrows();
    this.drawCentreMark();
    this.cameraView = this.centredLine(CAMERA_VIEW_RECT, FONT_SIZE.log, TEXT_COLOR);
    this.cameraZoom = this.centredLine(CAMERA_ZOOM_RECT, FONT_SIZE.log, TEXT_COLOR);

    // The inspection window (smoke test 2, slice E) is built with the rest and shown only while a unit
    // is being inspected: it floats over the board and over every panel of the HUD, so it is built
    // after them. The X is the only thing in it that takes a press, and the scene above reads it.
    this.inspectPanel = createPanel(this, INSPECT_RECT, t('inspect.title')).setVisible(false);
    this.inspectClose = new Button(this, INSPECT_CLOSE_RECT, INSPECT_CLOSE_LABEL).setVisible(false);
    this.inspectRows = this.add.container(0, 0);

    // Added last: a turn change floats over the panels, and it is gone before the next one comes.
    this.banner = new Banner(this, BANNER_RECT);

    this.built = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.apply(this.view);
  }

  /**
   * The log (smoke test 2, slice C): a box in the left column, as tall as it is open, with its own
   * header as the toggle. `createPanel` cannot draw it — a panel is built from a rectangle that never
   * changes — so the frame, the line inside it and the heading are drawn here once and resized on
   * every view, and the text under them is the one object the scene moves.
   */
  private createLog(): void {
    this.logFrame = this.add
      .rectangle(LOG_RECT.x, LOG_RECT.y, LOG_RECT.width, LOG_RECT.height, PANEL_FILL)
      .setOrigin(0)
      .setStrokeStyle(1, PANEL_STROKE)
      .setAlpha(OVERLAY_PANEL.fillAlpha);
    this.logInner = this.add.graphics();
    this.add.text(LOG_RECT.x + PADDING, LOG_RECT.y + PADDING, t('hud.panel.log'), {
      fontFamily: FONT_TITLE,
      fontSize: FONT_SIZE.unit,
      color: TEXT_COLOR,
    });
    this.logMark = this.add.graphics();
  }

  /** The box at the size it is drawn now, and the lines the view is showing inside it. */
  private drawLog(view: HudView): void {
    const box = logRect(view.logOpen);
    const inset = OVERLAY_PANEL.innerInset;

    this.logFrame.setSize(box.width, box.height);
    this.logInner.clear();
    this.logInner.lineStyle(1, PANEL_INNER_STROKE, OVERLAY_PANEL.innerAlpha);
    this.logInner.strokeRect(
      box.x + inset,
      box.y + inset,
      box.width - 2 * inset,
      box.height - 2 * inset,
    );
    this.drawLogMark(view.logOpen);

    // Closed, the box keeps its header and the last thing said: the line the player missed least.
    this.logText.setText((view.logOpen ? view.logLines : view.logLines.slice(-1)).join('\n'));
  }

  /**
   * The chevron at the right end of the header: it points down while the box is closed and up while it
   * is open. It is drawn rather than lettered for the reason the cog and the rotation arrows are —
   * neither face the HUD carries has a triangle in it, and a glyph borrowed from whatever font the
   * machine falls back to would be the one thing on the screen in another typeface.
   */
  private drawLogMark(open: boolean): void {
    const { x, y } = LOG_TOGGLE_POINT;
    const way = open ? -1 : 1;

    this.logMark.clear();
    this.logMark.lineStyle(2, PAPER_COLOR, 1);
    this.logMark.beginPath();
    this.logMark.moveTo(x - LOG_CHEVRON.halfWidth, y + (way * LOG_CHEVRON.height) / 2);
    this.logMark.lineTo(x, y - (way * LOG_CHEVRON.height) / 2);
    this.logMark.lineTo(x + LOG_CHEVRON.halfWidth, y + (way * LOG_CHEVRON.height) / 2);
    this.logMark.strokePath();
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
    this.moveChipButtons = [];
    this.cameraButtons = [];
    this.lastActive = null;
    this.built = false;
  }

  private apply(view: HudView): void {
    this.drawChips(view.state);
    this.drawDashboard(view.state, view.selectedId);
    this.drawInspection(view.state, view.inspectedId);
    this.drawButtons(view);
    this.drawMoveChips(view);
    this.drawSettings(view);
    this.drawAutoEndTurn(view);
    this.drawCamera(view);
    this.drawLog(view);
    this.drawBanner(view);

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

  /**
   * The unit's data along the bottom edge (smoke test 2, slice B). The rows are the ones the panel
   * model produces — this only lays them out: the health in the left cell, the resource in the right
   * one, and the movement, the action and the reaction on the line under the buttons, which is the
   * whole of the turn at a glance.
   *
   * The dashboard is redrawn whole on every view, so a row that has nothing to say is left out rather
   * than drawn dimmed in a place of its own: the two cells hold one number each, and a unit that is
   * not on turn has no movement or action to show.
   */
  private drawDashboard(state: PublicState | null, selectedId: string | null): void {
    this.panelRows.removeAll(true);
    if (state === null) return;

    const rows = unitPanel(state, selectedId);
    const health = rows.find((row) => row.key === 'hp');
    const resources = rows.filter((row) => row.key === 'ammo' || row.key === 'mana');
    // The resource the unit actually carries, or the last of the rows as a placeholder: a class with
    // no magazine has an ammunition row saying nothing and a mana row waiting on the engine (DT-57).
    const resource = resources.find((row) => row.fill !== null) ?? resources[resources.length - 1];

    if (health !== undefined) this.drawCell(health, DASHBOARD_HEALTH_RECT);
    if (resource !== undefined) this.drawCell(resource, DASHBOARD_AMMO_RECT);

    const turn = rows.filter(
      (row) => row.key === 'movement' || row.key === 'action' || row.key === 'reaction',
    );
    if (turn.length === 0) return;

    const color = turn.some((row) => row.enabled) ? TEXT_COLOR : TEXT_COLOR_DISABLED;
    const line = turn.map((row) => `${row.label} ${row.value}`).join(' · ');
    const point = DASHBOARD_TURN_POINT;

    this.panelRows.add(
      this.add
        .text(point.x, point.y, line, { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color })
        .setOrigin(0.5, 0),
    );
  }

  /**
   * The inspection window (smoke test 2, slice E): the sheet a right-click on a unit opens, over the
   * board. It draws and it asks nothing — the sheet comes from the tested model and the scene above
   * decides when the window is open — so the X is drawn here and pressed there.
   */
  private drawInspection(state: PublicState | null, inspectedId: string | null): void {
    this.inspectRows.removeAll(true);

    const sheet = state === null ? null : unitSheet(state, inspectedId);
    this.inspectPanel.setVisible(sheet !== null);
    this.inspectClose.setVisible(sheet !== null);
    if (sheet === null) return;

    sheet.rows.forEach((row, index) => {
      const point = inspectRowPoint(index);

      this.inspectRows.add([
        this.add.text(point.x, point.y, row.label, {
          fontFamily: FONT_BODY,
          fontSize: FONT_SIZE.log,
          color: TEXT_COLOR,
        }),
        this.add
          .text(INSPECT_VALUE_X, point.y, row.value, {
            fontFamily: FONT_BODY,
            fontSize: FONT_SIZE.log,
            color: TEXT_COLOR,
          })
          .setOrigin(1, 0),
      ]);
    });
  }

  /** One number of the dashboard: its label, its value at the far end, and its bar under both. */
  private drawCell(row: PanelRow, cell: Rect): void {
    const color = row.enabled ? TEXT_COLOR : TEXT_COLOR_DISABLED;
    const label = cellLabelPoint(cell);
    const value = cellValuePoint(cell);

    this.panelRows.add([
      this.add.text(label.x, label.y, row.label, { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color }),
      this.add
        .text(value.x, value.y, row.value, { fontFamily: FONT_BODY, fontSize: FONT_SIZE.log, color })
        .setOrigin(1, 0),
    ]);

    if (row.fill === null) return;

    const bar = cellBarPoint(cell);
    const width = cellBarWidth(cell);
    this.panelRows.add([
      this.add.rectangle(bar.x, bar.y, width, CELL_BAR_HEIGHT, PANEL_STROKE).setOrigin(0),
      this.add
        .rectangle(bar.x, bar.y, width * row.fill, CELL_BAR_HEIGHT, CURRENT_TURN_COLOR)
        .setOrigin(0),
    ]);
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
   * The two controls of a pending move (EA-5, D6), floating over the board above the Move button.
   * They are rebuilt rather than reused, because which of them exists is the pending move itself,
   * and they never need to survive a state: a run that closes takes both with it.
   */
  private drawMoveChips(view: HudView): void {
    this.moveChipButtons.forEach((chip) => chip.destroy());
    this.moveChipButtons = view.moveChips.map(
      (chip, index) => new Button(this, moveChipRect(index), chip.label),
    );
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
   * The camera panel (EA-12): the side the camera is looking from, and the step the zoom is on. The
   * scene hands both over on every redraw, so the panel never reads the camera itself.
   */
  private drawCamera(view: HudView): void {
    const direction = t(`hud.camera.${view.camera.view}`);
    this.cameraView.setText(t('hud.camera.view', { direction }));
    this.cameraZoom.setText(t('hud.camera.zoom', { step: view.camera.zoom }));
  }

  /** The two rotation buttons: an arrow bent three quarters of the way round, mirrored for the other way. */
  private drawRotateArrows(): void {
    this.drawRotateArrow('rotateLeft', -1);
    this.drawRotateArrow('rotateRight', 1);
  }

  /**
   * One of them. The head sits at the top of the circle, in the gap the arc leaves there, and points
   * the way the view turns: a thrown-together arrow reads better here than a glyph borrowed from
   * whatever face the machine falls back to.
   */
  private drawRotateArrow(control: CameraControl, way: 1 | -1): void {
    const cell = cameraControlRect(control);
    const centre = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
    const top = centre.y - ROTATE_RADIUS;
    const arrow = this.add.graphics();

    arrow.lineStyle(2, PAPER_COLOR, 1);
    arrow.beginPath();
    arrow.arc(centre.x, centre.y, ROTATE_RADIUS, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + Math.PI * 2);
    arrow.strokePath();
    arrow.fillStyle(PAPER_COLOR, 1);
    arrow.fillTriangle(centre.x - way * 2, top - 4, centre.x - way * 2, top + 4, centre.x + way * 7, top);
  }

  /** The button that brings the map back to the middle: a target, drawn rather than lettered. */
  private drawCentreMark(): void {
    const cell = cameraControlRect('centre');
    const centre = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
    const mark = this.add.graphics();

    mark.lineStyle(2, PAPER_COLOR, 1);
    mark.strokeCircle(centre.x, centre.y, CENTRE_RIM_RADIUS);
    mark.fillStyle(PAPER_COLOR, 1);
    mark.fillCircle(centre.x, centre.y, CENTRE_DOT_RADIUS);
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
