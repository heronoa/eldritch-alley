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
import {
  CORPSE_COLOR,
  CORPSE_OUTLINE_COLOR,
  PANEL_STROKE,
  PAPER_COLOR,
  SELECTED_COLOR,
  TEAM_COLOR,
  WARM_COLOR,
} from '../view/theme';
import {
  classRow,
  frameIndex,
  healthFraction,
  markerStyle,
  pipsFor,
  spriteSheetOf,
  type Pips,
} from '../view/unit-look';

/** Columns of the sheet, in the order the characters README lists them. */
const COLUMN = {
  idle1: 0,
  idle2: 1,
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

/**
 * Geometry of a drawn unit, in pixels. The body is a 16x24 frame drawn at twice its size, which is
 * the size the prototype's own figures take at its scale: the tile of the map is 64 by 32.
 */
const BODY_SCALE = 2;

/** How tall the figure stands above its feet, which is what the bars and the shot leave from. */
export const BODY_HEIGHT = 24 * BODY_SCALE;

/** The ground marker lies flat on the tile, so its two axes follow the two axes of the top face. */
const MARKER_HALF_WIDTH = TILE_W * 0.22;
const MARKER_HALF_HEIGHT = TILE_H * 0.22;
const CORNER_SIZE = 4;
const RING_GAP = 3;
const HEALTH_BAR = { width: 32, height: 4, gapAboveBody: 6 };
const PIP = { size: 4, gap: 3, gapAboveBar: 6 };

/** What the sprite is busy with, and when it started. Only one action runs at a time. */
type Action =
  | { kind: 'attack'; style: 'melee' | 'ranged'; hit: boolean; start: number; impactAt: number; impactUntil: number }
  | { kind: 'reload'; from: number; to: number; start: number };

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

  private team: Team = 'A';
  /** The row of the sheet this unit is drawn from. A class without one falls back to Combatant. */
  private row = 0;
  /** When the sprite appeared, so its breathing has a phase of its own rather than the scene's. */
  private readonly bornAt: number;
  private defeated = false;
  private selected = false;
  private health = { health: 0, maxHealth: 0 };
  private pips: Pips | null = null;
  private action: Action | null = null;
  private moving: { start: number } | null = null;

  constructor(scene: Phaser.Scene, unit: UnitState, selected: boolean, placement: Placement) {
    super(scene, 0, 0);
    this.bornAt = scene.time.now;

    // Drawing order inside the container: the ground, the body on it, the bars, then the ring.
    this.marker = scene.add.graphics();
    this.corpse = scene.add.graphics();
    this.figure = scene.add.sprite(0, 0, 'unit-ally', 0).setOrigin(0.5, 1).setScale(BODY_SCALE);
    this.bars = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.add([this.marker, this.corpse, this.figure, this.bars, this.ring]);

    scene.add.existing(this);
    this.sync(unit, selected, placement);
  }

  /** Redraws what the state says about the unit. A unit mid-move is left where its tween has it. */
  sync(unit: UnitState, selected: boolean, placement: Placement): void {
    this.team = unit.team;
    this.row = classRow(unit.primaryClass) ?? 0;
    this.defeated = unit.defeated;
    this.selected = selected;
    this.health = { health: unit.health, maxHealth: unit.maxHealth };
    this.pips = pipsFor(unit);

    this.figure.setTexture(`unit-${spriteSheetOf(unit.team)}`);
    // Each team faces the other from the start, so a unit is never seen from behind by its side.
    this.figure.setFlipX(unit.team === 'B');

    if (this.moving === null) this.snapTo(placement);

    this.drawMarker();
    this.drawCorpse();
    this.drawRing();
    this.drawBars(this.scene.time.now);
  }

  /** The body falls: grey, outlined, with no bars, and it stays on its tile until it is removed. */
  markDefeated(): void {
    this.defeated = true;
    this.drawMarker();
    this.drawCorpse();
    this.drawBars(this.scene.time.now);
  }

  /**
   * Slides the unit across the cells it was moved, one step of the walk per 150 ms. The length is the
   * cell distance, so a step is the same length wherever on the board it happens; the depth follows
   * the slide so a unit moving towards the viewer comes out over the tiles it passes.
   */
  slideTo(from: Placement, to: Placement): void {
    const cells = Math.max(Math.abs(to.cell.x - from.cell.x), Math.abs(to.cell.y - from.cell.y));
    const fromDepth = depthOfUnit(from.cell);
    const toDepth = depthOfUnit(to.cell);

    this.moving = { start: this.scene.time.now };
    this.snapTo(from);
    this.scene.tweens.add({
      targets: this,
      x: to.anchor.x,
      y: to.anchor.y,
      duration: movementDuration(cells),
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        this.setDepth(fromDepth + (toDepth - fromDepth) * tween.progress);
      },
      onComplete: () => {
        this.moving = null;
        this.setDepth(toDepth);
      },
    });
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

    return frameIndex(this.row, this.idleColumn(now));
  }

  private idleColumn(now: number): number {
    return idleFrame(now - this.bornAt) === 1 ? COLUMN.idle1 : COLUMN.idle2;
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

    for (let i = 0; i < this.pips.total; i += 1) {
      this.bars.fillStyle(i < filled ? WARM_COLOR : PANEL_STROKE, 1);
      this.bars.fillRect(-width / 2 + i * (PIP.size + PIP.gap), y, PIP.size, PIP.size);
    }
  }

  /** How many pips the magazine shows right now: the animation wins while it is running. */
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
