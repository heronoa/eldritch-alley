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
  FONT,
  FONT_SIZE,
  PANEL_FILL,
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

/** A button of the action bar. It can be pressed, armed, or out of reach. */
export class Button extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly onPress: () => void;
  private usable = true;
  private armed = false;

  constructor(scene: Phaser.Scene, rect: Rect, label: string, onPress: () => void) {
    super(scene, rect.x, rect.y);
    this.onPress = onPress;

    this.background = scene.add.rectangle(0, 0, rect.width, rect.height, BUTTON_FILL).setOrigin(0);
    this.caption = scene.add
      .text(rect.width / 2, rect.height / 2, label, {
        fontFamily: FONT,
        fontSize: FONT_SIZE.unit,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.add([this.background, this.caption]);
    this.setSize(rect.width, rect.height);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, rect.width, rect.height),
      Phaser.Geom.Rectangle.Contains,
    );
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerdown', () => {
      if (this.usable) this.onPress();
    });

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

/** A framed box with a title in its top-left corner. */
export function createPanel(scene: Phaser.Scene, rect: Rect, title: string): Phaser.GameObjects.Container {
  const frame = scene.add.rectangle(0, 0, rect.width, rect.height, PANEL_FILL).setOrigin(0);
  frame.setStrokeStyle(1, PANEL_STROKE);

  const heading = scene.add.text(PADDING, PADDING, title, {
    fontFamily: FONT,
    fontSize: FONT_SIZE.unit,
    color: TEXT_COLOR,
  });

  return scene.add.container(rect.x, rect.y, [frame, heading]);
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
      fontFamily: FONT,
      fontSize: FONT_SIZE.title,
      color: cssColor(labelColorOn(fill)),
    })
    .setOrigin(0.5);

  return scene.add.container(rect.x, rect.y, [body, letter]);
}
