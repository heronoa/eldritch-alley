// One unit on the board: the ground marker, the pixel sprite, the selection ring, the bars above the
// head, and the timed actions the server's events ask for.
//
// The sprite draws what the pure modules return — which sheet, which frame, how full the bars are —
// and decides no rule of the game. It keeps one action at a time and the moment that action started.
import Phaser from 'phaser';
import type { Team, UnitState } from '../protocol';
import {
  ATTACK_TIMELINE,
  RELOAD_TIMELINE,
  attackFrame,
  filledPipsAt,
  idleFrame,
  movementDuration,
  reloadFrame,
  walkFrame,
} from '../view/animation';
import type { Cell, Pixel } from '../view/grid';
import { TILE_H, TILE_W, depthOfUnit } from '../view/iso';
import { TURN_ARROW, TURN_ARROW_POINT } from '../view/layout';
import {
  COVER_BADGE_FILL,
  COVER_BADGE_STROKE,
  CORPSE_COLOR,
  CORPSE_OUTLINE_COLOR,
  FONT_BODY,
  FONT_SIZE,
  MANA_COLOR,
  PANEL_STROKE,
  PAPER_COLOR,
  SELECTED_COLOR,
  TEAM_COLOR,
  WARM_COLOR,
  cssColor,
} from '../view/theme';
import {
  BODY_HEIGHT,
  BODY_SCALE,
  classRow,
  frameIndex,
  healthFraction,
  markerStyle,
  pipsFor,
  rowIdleFrame,
  spriteSheetOf,
  turnLook,
  type Pips,
} from '../view/unit-look';

/**
 * Columns of the sheet, in the order the characters README lists them. The two idle poses are not
 * here: which one is drawn is `rowIdleFrame`'s answer, shared with the turn (slice A).
 */
const COLUMN = {
  walk1: 2,
  walk2: 3,
  melee1: 4,
  melee2: 5,
  ranged1: 6,
  ranged2: 7,
  resource1: 8,
  resource2: 9,
} as const;

/** Which two frames an attack shows, by the distance it was thrown from. */
const ATTACK_COLUMNS = {
  melee: [COLUMN.melee1, COLUMN.melee2],
  ranged: [COLUMN.ranged1, COLUMN.ranged2],
};

/** The corners of a diamond, as fractions of its half width: top, right, bottom, left. */
const DIAMOND = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The ground marker lies flat on the tile, so its two axes follow the two axes of the top face. */
const MARKER_HALF_WIDTH = TILE_W * 0.22;
const MARKER_HALF_HEIGHT = TILE_H * 0.22;
const CORNER_SIZE = 4;
const RING_GAP = 3;
const HEALTH_BAR = { width: 32, height: 4, gapAboveBody: 6 };
const PIP = { size: 4, gap: 3, gapAboveBar: 6 };

/**
 * The badge a unit in cover wears (EA-15), over everything else the sprite raises: its bottom sits
 * above the tip of the turn arrow (-72) so the two never share a line, and it grows upwards from
 * there. The arrow is the highest of the other marks, so the badge clears all of them.
 */
const COVER_BADGE = { gapAboveArrow: 6, strokeThickness: 4 };

/** What the sprite is busy with, and when it started. Only one action runs at a time. */
type Action =
  | { kind: 'attack'; style: 'melee' | 'ranged'; hit: boolean; start: number; impactAt: number; impactUntil: number }
  | { kind: 'reload'; from: number; to: number; start: number };

/**
 * The two marks the scene puts on a unit: the one the player picked, and the one the turn is on.
 * They are not the same thing — the player may have picked anybody while somebody else acts.
 */
export interface UnitMarks {
  selected: boolean;
  active: boolean;
}

/** What the scene tells the sprite about an attack it has to play. */
export interface AttackPlan {
  style: 'melee' | 'ranged';
  hit: boolean;
  travelMs: number;
}

/**
 * Where a unit is: the cell it occupies and the screen point its feet rest on, which is the centre of
 * that cell's top face. The cell travels with the point because the depth and the length of a slide
 * are counted in cells, and a screen point no longer says how many.
 */
export interface Placement {
  cell: Cell;
  anchor: Pixel;
}

/** How long an attack takes to reach its target: the strike at reach, the flight at range. */
function impactDelay(style: 'melee' | 'ranged', travelMs: number): number {
  return style === 'melee' ? ATTACK_TIMELINE.strikeStart : ATTACK_TIMELINE.travelStart + travelMs;
}

export class UnitSprite extends Phaser.GameObjects.Container {
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly corpse: Phaser.GameObjects.Graphics;
  private readonly figure: Phaser.GameObjects.Sprite;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly arrow: Phaser.GameObjects.Graphics;
  /** The words over the head of a unit in cover, or nothing at all (EA-15). */
  private readonly coverBadge: Phaser.GameObjects.Text;

  private team: Team = 'A';
  /** The row of the sheet this unit is drawn from. A class without one falls back to Combatant. */
  private row = 0;
  /** When the sprite appeared, so its breathing has a phase of its own rather than the scene's. */
  private readonly bornAt: number;
  private defeated = false;
  private selected = false;
  /** True only while this unit is the one the turn is on, which is what raises its arrow. */
  private onTurn = false;
  private health = { health: 0, maxHealth: 0 };
  private pips: Pips | null = null;
  private action: Action | null = null;
  private moving: { start: number } | null = null;

  constructor(
    scene: Phaser.Scene,
    unit: UnitState,
    marks: UnitMarks,
    placement: Placement,
    facesRight: boolean,
  ) {
    super(scene, 0, 0);
    this.bornAt = scene.time.now;

    // Drawing order inside the container: the ground, the body on it, the bars, the arrow, the ring,
    // and the words of cover over the lot.
    this.marker = scene.add.graphics();
    this.corpse = scene.add.graphics();
    this.figure = scene.add.sprite(0, 0, 'unit-ally', 0).setOrigin(0.5, 1).setScale(BODY_SCALE);
    this.bars = scene.add.graphics();
    this.arrow = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.coverBadge = scene.add
      .text(0, TURN_ARROW_POINT.y - TURN_ARROW.height - COVER_BADGE.gapAboveArrow, '', {
        fontFamily: FONT_BODY,
        fontSize: `${FONT_SIZE.log}px`,
        color: cssColor(COVER_BADGE_FILL),
      })
      .setOrigin(0.5, 1)
      .setStroke(cssColor(COVER_BADGE_STROKE), COVER_BADGE.strokeThickness)
      .setVisible(false);
    this.add([this.marker, this.corpse, this.figure, this.bars, this.arrow, this.ring, this.coverBadge]);

    scene.add.existing(this);
    this.sync(unit, marks, placement, facesRight);
  }

  /**
   * Redraws what the state says about the unit. A unit mid-move is left where its tween has it.
   * `facesRight` is which way round its figure is drawn, which the view works out: a view turned a
   * quarter puts the squad that was on the left on the right (EA-12).
   */
  sync(unit: UnitState, marks: UnitMarks, placement: Placement, facesRight: boolean): void {
    const look = turnLook(marks.active);

    this.team = unit.team;
    this.row = classRow(unit.primaryClass) ?? 0;
    this.defeated = unit.defeated;
    this.selected = marks.selected;
    this.onTurn = look.arrow;
    // The units that are not acting step back, so the one that is reads at a glance (EA-3).
    this.setAlpha(look.alpha);
    this.health = { health: unit.health, maxHealth: unit.maxHealth };
    this.pips = pipsFor(unit);

    this.figure.setTexture(`unit-${spriteSheetOf(unit.team)}`);
    // A sprite is drawn facing one way, so the side that faces the other is the one that is mirrored.
    this.figure.setFlipX(!facesRight);

    if (this.moving === null) this.snapTo(placement);

    this.drawMarker();
    this.drawCorpse();
    this.drawArrow();
    this.drawRing();
    this.drawBars(this.scene.time.now);
  }

  /** The body falls: grey, outlined, with no bars, and it stays on its tile until it is removed. */
  markDefeated(): void {
    this.defeated = true;
    // A fallen unit is covered by nothing, and the words would hang over the body it left (EA-15).
    this.setCoverBadge(null);
    this.drawMarker();
    this.drawCorpse();
    this.drawArrow();
    this.drawBars(this.scene.time.now);
  }

  /**
   * Writes the words the scene worked out over the unit's head, or takes them down with `null`. The
   * sprite decides nothing: which sides carry cover and in which language is the scene's business
   * (`game/coverBadge.ts`), and this only draws what it is handed.
   */
  setCoverBadge(text: string | null): void {
    this.coverBadge.setText(text ?? '');
    this.coverBadge.setVisible(text !== null);
  }

  /**
   * Walks the unit through the cells the server sent, one step of the walk per 150 ms. The steps are
   * the engine's own path, so the figure follows the route it was moved along instead of a straight
   * line; the depth follows each step, so a unit moving towards the viewer comes out over the tiles
   * it passes.
   */
  walkTo(steps: readonly Placement[]): void {
    const first = steps[0];
    if (first === undefined) return;

    // A walk with nothing to walk leaves the figure where it is, and stops the walk frame.
    this.snapTo(first);
    if (steps.length === 1) {
      this.moving = null;
      return;
    }

    this.moving = { start: this.scene.time.now };
    const stepMs = movementDuration(1);
    for (let index = 1; index < steps.length; index += 1) {
      const from = steps[index - 1];
      const to = steps[index];
      const fromDepth = depthOfUnit(from.cell);
      const toDepth = depthOfUnit(to.cell);

      this.scene.tweens.add({
        targets: this,
        x: to.anchor.x,
        y: to.anchor.y,
        duration: stepMs,
        // The steps run one after the other, so the walk covers the whole path in order.
        delay: (index - 1) * stepMs,
        onUpdate: (tween: Phaser.Tweens.Tween) => {
          this.setDepth(fromDepth + (toDepth - fromDepth) * tween.progress);
        },
        onComplete: () => {
          this.setDepth(toDepth);
          if (index === steps.length - 1) this.moving = null;
        },
      });
    }
  }

  /**
   * Plays the attack. The effect of the impact is the scene's business, so it is handed over as a
   * callback and fired at the moment the attack reaches the target.
   */
  playAttack(plan: AttackPlan, now: number, onImpact: () => void): void {
    const delay = impactDelay(plan.style, plan.travelMs);

    this.action = {
      kind: 'attack',
      style: plan.style,
      hit: plan.hit,
      start: now,
      impactAt: now + delay,
      impactUntil: now + delay + ATTACK_TIMELINE.impactLength,
    };
    this.scene.time.delayedCall(delay, onImpact);
  }

  /** Refills the magazine frame by frame, the pips following `filledPipsAt`. */
  playReload(from: number, to: number, now: number): void {
    this.action = { kind: 'reload', from, to, start: now };
  }

  /** Advances the action and the pose. Called once per frame by the scene. */
  tick(now: number): void {
    this.expire(now);
    this.figure.setFrame(this.frameAt(now));
    if (this.action?.kind === 'reload') this.drawBars(now);
    this.applyHitFeedback(now);
  }

  /** Drops the action once its last frame has been shown, keeping what it changed. */
  private expire(now: number): void {
    if (this.action === null) return;

    const elapsed = now - this.action.start;
    const duration = this.action.kind === 'attack' ? ATTACK_TIMELINE.recover : RELOAD_TIMELINE.end;
    if (elapsed < duration) return;

    // The magazine stays refilled after the animation is over, until the state confirms it.
    if (this.action.kind === 'reload' && this.pips !== null) {
      this.pips = { ...this.pips, filled: this.action.to };
    }

    this.action = null;
    this.drawBars(now);
  }

  private frameAt(now: number): number {
    if (this.moving !== null) {
      const column = walkFrame(now - this.moving.start) === 1 ? COLUMN.walk1 : COLUMN.walk2;
      return frameIndex(this.row, column);
    }

    if (this.action?.kind === 'attack') {
      const frame = attackFrame(now - this.action.start);
      if (frame !== 0) return frameIndex(this.row, ATTACK_COLUMNS[this.action.style][frame - 1]);
    }

    if (this.action?.kind === 'reload') {
      const frame = reloadFrame(now - this.action.start);
      if (frame !== 0) return frameIndex(this.row, frame === 1 ? COLUMN.resource1 : COLUMN.resource2);
    }

    return this.idleFrame(now);
  }

  /**
   * The resting pose, chosen by the same function the flat figure of a turn is drawn from (slice A of
   * the smoke test 2 feedback), so the unit the turn shows is the unit standing on the board.
   */
  private idleFrame(now: number): number {
    return rowIdleFrame(this.row, idleFrame(now - this.bornAt) - 1);
  }

  /** A hit is a white silhouette and a one-pixel shake, so it reads over any tile. */
  private applyHitFeedback(now: number): void {
    const flash =
      this.action?.kind === 'attack' &&
      this.action.hit &&
      now >= this.action.impactAt &&
      now < this.action.impactUntil;

    if (flash) {
      this.figure.setTintFill(0xffffff);
      this.figure.x = Math.floor(now / 60) % 2 === 0 ? -1 : 1;
      return;
    }

    this.figure.x = 0;
    if (this.defeated) this.figure.setTint(CORPSE_COLOR);
    else this.figure.clearTint();
  }

  /** Puts the unit on its tile: feet at the anchor, and the depth of the cell it stands on. */
  private snapTo(placement: Placement): void {
    this.setPosition(placement.anchor.x, placement.anchor.y);
    this.setDepth(depthOfUnit(placement.cell));
  }

  private drawMarker(): void {
    this.marker.clear();
    if (this.defeated) return;

    const corners = this.diamond(MARKER_HALF_WIDTH, MARKER_HALF_HEIGHT);
    this.marker.fillStyle(TEAM_COLOR[this.team], 1);
    this.marker.fillPoints(corners, true);
    this.marker.lineStyle(1, PAPER_COLOR, 1);
    this.marker.strokePoints(corners, true, true);

    // The bot's side is told by shape as well as by colour: four squares on the diamond's corners.
    if (!markerStyle(this.team).corners) return;

    for (const corner of corners) {
      this.marker.fillStyle(TEAM_COLOR.B, 1);
      this.marker.fillRect(corner.x - CORNER_SIZE / 2, corner.y - CORNER_SIZE / 2, CORNER_SIZE, CORNER_SIZE);
      this.marker.lineStyle(1, PAPER_COLOR, 1);
      this.marker.strokeRect(corner.x - CORNER_SIZE / 2, corner.y - CORNER_SIZE / 2, CORNER_SIZE, CORNER_SIZE);
    }
  }

  private drawCorpse(): void {
    this.corpse.clear();
    if (!this.defeated) return;

    this.corpse.lineStyle(2, CORPSE_OUTLINE_COLOR, 1);
    this.corpse.strokePoints(this.diamond(MARKER_HALF_WIDTH, MARKER_HALF_HEIGHT), true, true);
  }

  /** The arrow over the head of the unit on turn, in the colour of its team. A fallen unit has none. */
  private drawArrow(): void {
    this.arrow.clear();
    if (!this.onTurn || this.defeated) return;

    const tip = TURN_ARROW_POINT;
    const base = tip.y - TURN_ARROW.height;
    const half = TURN_ARROW.halfWidth;

    this.arrow.fillStyle(TEAM_COLOR[this.team], 1);
    this.arrow.fillTriangle(tip.x - half, base, tip.x + half, base, tip.x, tip.y);
    // The paper outline is what makes the arrow read over a light tile as well as a dark one.
    this.arrow.lineStyle(1, PAPER_COLOR, 1);
    this.arrow.strokeTriangle(tip.x - half, base, tip.x + half, base, tip.x, tip.y);
  }

  private drawRing(): void {
    this.ring.clear();
    if (!this.selected) return;

    this.ring.lineStyle(3, SELECTED_COLOR, 1);
    this.ring.strokePoints(
      this.diamond(MARKER_HALF_WIDTH + RING_GAP, MARKER_HALF_HEIGHT + RING_GAP),
      true,
      true,
    );
  }

  private drawBars(now: number): void {
    this.bars.clear();
    if (this.defeated) return;

    const top = -BODY_HEIGHT - HEALTH_BAR.gapAboveBody;
    const left = -HEALTH_BAR.width / 2;

    this.bars.fillStyle(PANEL_STROKE, 1);
    this.bars.fillRect(left, top, HEALTH_BAR.width, HEALTH_BAR.height);
    this.bars.fillStyle(TEAM_COLOR[this.team], 1);
    this.bars.fillRect(left, top, HEALTH_BAR.width * healthFraction(this.health), HEALTH_BAR.height);

    if (this.pips === null) return;

    const filled = this.filledPips(now);
    const width = this.pips.total * PIP.size + (this.pips.total - 1) * PIP.gap;
    const y = top - PIP.gapAboveBar - PIP.size;

    // The pool is counted the same for both kinds; only the colour tells a magazine from mana.
    const lit = this.pips.resource === 'mana' ? MANA_COLOR : WARM_COLOR;
    for (let i = 0; i < this.pips.total; i += 1) {
      this.bars.fillStyle(i < filled ? lit : PANEL_STROKE, 1);
      this.bars.fillRect(-width / 2 + i * (PIP.size + PIP.gap), y, PIP.size, PIP.size);
    }
  }

  /** How many pips the pool shows right now: the animation wins while it is running. */
  private filledPips(now: number): number {
    if (this.pips === null) return 0;
    if (this.action?.kind === 'reload') {
      return filledPipsAt(now - this.action.start, this.action.from, this.action.to);
    }

    return this.pips.filled;
  }

  /** The four corners of a flat diamond lying on a top face, by its two half axes. */
  private diamond(halfWidth: number, halfHeight: number): Pixel[] {
    return DIAMOND.map((point) => ({ x: point.x * halfWidth, y: point.y * halfHeight }));
  }
}
