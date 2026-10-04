// The three widgets of the HUD. They only draw: every label, order, enabled flag and colour comes
// from `game/` or `view/`, and the widgets are told what to show.
//
// `view/` stays free of Phaser by convention, so these live beside the scenes. `Button` is a class
// because it is the only one of the three that keeps visual state across ticks; the panel and the
// carousel chips are rebuilt wholesale from the pure models on each state message.
import Phaser from 'phaser';
import type { TurnSlot } from '../game/turn-order';
import type { UnitState } from '../protocol';
import { PADDING, type Rect } from '../view/layout';
import {
  BUTTON_FILL,
  BUTTON_FILL_DISABLED,
  BUTTON_FILL_SELECTED,
  CORPSE_COLOR,
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  PANEL_FILL,
  PANEL_INNER_ALPHA,
  PANEL_INNER_STROKE,
  PANEL_STROKE,
  TEAM_COLOR,
  TEXT_COLOR,
  TEXT_COLOR_DISABLED,
  TEXT_COLOR_ON_LIGHT,
  cssColor,
  labelColorOn,
} from '../view/theme';

/** Sniper, wizard, priest — the first letter of the class names a unit everywhere it is drawn. */
export function initialOf(unit: { primaryClass: string }): string {
  return unit.primaryClass.charAt(0).toUpperCase();
}

/**
 * A button of the action bar. It can be pressed, armed, or out of reach.
 *
 * It only draws, and it does not take pointer input of its own. The scene hit-tests the rectangle
 * `buttonRect` returns, which is the same rectangle this widget is built from, so the click lands
 * where the button is drawn (DT-30) and the two paths can never disagree.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly caption: Phaser.GameObjects.Text;
  private usable = true;
  private armed = false;

  constructor(scene: Phaser.Scene, rect: Rect, label: string) {
    super(scene, rect.x, rect.y);

    this.background = scene.add
      .rectangle(0, 0, rect.width, rect.height, BUTTON_FILL)
      .setOrigin(0)
      .setStrokeStyle(1, PANEL_STROKE);
    this.caption = scene.add
      .text(rect.width / 2, rect.height / 2, label, {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.unit,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.add([this.background, this.caption]);
    scene.add.existing(this);
  }

  setLabel(label: string): void {
    this.caption.setText(label);
  }

  setEnabled(enabled: boolean): void {
    this.usable = enabled;
    this.refresh();
  }

  setSelected(selected: boolean): void {
    this.armed = selected;
    this.refresh();
  }

  /** A button nobody may press is never shown as the armed one, so being out of reach wins. */
  private refresh(): void {
    const fill = !this.usable
      ? BUTTON_FILL_DISABLED
      : this.armed
        ? BUTTON_FILL_SELECTED
        : BUTTON_FILL;

    this.background.setFillStyle(fill);
    this.caption.setColor(this.usable ? (this.armed ? TEXT_COLOR_ON_LIGHT : TEXT_COLOR) : TEXT_COLOR_DISABLED);
  }
}

/** How far inside the frame the second line is drawn. */
const PANEL_INNER_INSET = 4;

/**
 * A framed box with a title in its top-left corner: a carbon frame, a paper line just inside it, and
 * the heading in the typewriter face.
 */
export function createPanel(scene: Phaser.Scene, rect: Rect, title: string): Phaser.GameObjects.Container {
  const frame = scene.add.rectangle(0, 0, rect.width, rect.height, PANEL_FILL).setOrigin(0);
  frame.setStrokeStyle(1, PANEL_STROKE);

  const inner = scene.add.graphics();
  inner.lineStyle(1, PANEL_INNER_STROKE, PANEL_INNER_ALPHA);
  inner.strokeRect(
    PANEL_INNER_INSET,
    PANEL_INNER_INSET,
    rect.width - 2 * PANEL_INNER_INSET,
    rect.height - 2 * PANEL_INNER_INSET,
  );

  const heading = scene.add.text(PADDING, PADDING, title, {
    fontFamily: FONT_TITLE,
    fontSize: FONT_SIZE.unit,
    color: TEXT_COLOR,
  });

  return scene.add.container(rect.x, rect.y, [frame, inner, heading]);
}

/** The fill of a unit: the colour of its team, greyed out once it has fallen. */
export function fillColorOf(unit: UnitState): number {
  return unit.defeated ? CORPSE_COLOR : TEAM_COLOR[unit.team];
}

/** One slot of the carousel: the unit's letter on its team colour, ringed while it is on turn. */
export function createTurnChip(
  scene: Phaser.Scene,
  rect: Rect,
  slot: TurnSlot,
): Phaser.GameObjects.Container {
  const fill = fillColorOf(slot.unit);

  const body = scene.add.rectangle(0, 0, rect.width, rect.height, fill).setOrigin(0);
  if (slot.isCurrent) body.setStrokeStyle(3, CURRENT_TURN_COLOR);

  const letter = scene.add
    .text(rect.width / 2, rect.height / 2, initialOf(slot.unit), {
      fontFamily: FONT_TITLE,
      fontSize: FONT_SIZE.title,
      color: cssColor(labelColorOn(fill)),
    })
    .setOrigin(0.5);

  return scene.add.container(rect.x, rect.y, [body, letter]);
}
