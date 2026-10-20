// The combat effects: short drawings that appear where an attack lands. Each one destroys itself
// when it is done, so nothing outlives the action that caused it and no state is kept here.
import Phaser from 'phaser';
import type { AbilityImpact } from '../game/presentation';
import type { Position } from '../protocol';
import { ATTACK_TIMELINE } from '../view/animation';
import type { Effect } from '../view/effects';
import type { Pixel } from '../view/grid';
import { LAYER } from '../view/depth';
import { TILE_W } from '../view/iso';
import { PAPER_COLOR } from '../view/theme';

/** A 6 px flash at the actor's own tile, for the attack thrown from the hand. */
const PISTOL_FLASH = { size: 6, durationMs: 80 };

/** A 16 px flash on the target, for the hit that lands without travelling. */
const GLOW_IMPACT = { size: 16, durationMs: 260 };

/** The arcs of the wizard's gust. */
const GUST = { arcs: 3, durationMs: 300, alpha: 0.5, firstRadius: 8, radiusStep: 4 };

/** The darts of the magic missiles: three dots on curved paths, one behind the other. */
const MISSILES = { count: 3, size: 4, firstBow: 18, bowStep: 10 };

/** The column of the priest's attack, falling from above the target's tile. */
const COLUMN = { width: 10, height: 40 };

/** The bits of the target that scatter at the end of the flight. */
const PARTICLE = { count: 4, size: 3, spread: 22 };

/** The heavier flash a shot of an ability lands with, over the one its own effect draws. */
const ABILITY_HIT = { size: 20, durationMs: 300 };

/** The ring drawn on the aim of an area, and the flash each of the cells it covers gets. */
const BLAST_RING = { radius: 34, width: 3, durationMs: 340 };
const BLAST_FLASH = { size: 24, durationMs: 300, staggerMs: 45 };

/** The soft column of light a heal lifts off every cell it covers, one behind the other. */
const HEAL_GLOW = { width: 14, height: 34, rise: 22, durationMs: 480, staggerMs: 45 };

/**
 * Where the board draws the two ends of an impact (EA-16): the pixel an effect is thrown from, and the
 * pixel a cell of the map is drawn at. The scene owns both, because both are the view's — the effect
 * module is handed pixels and knows nothing about cells, rotation or levels.
 */
export interface ImpactDrawing {
  /**
   * The point the effect is thrown from: the caster's own figure, or null when the scene is not drawing
   * one. A shot with nowhere to leave from is dropped, and the landing it still has is drawn.
   */
  readonly from: Pixel | null;
  /** The point a cell of the board is drawn at, which is where the impact lands on it. */
  at(cell: Position): Pixel;
}

/**
 * Draws the impact of an ability (EA-16). The kind of the effect was decided by `presentation.ts` from
 * the engine's own rules, so the three drawings below are chosen by what the ability does and never by
 * its name: a shot travels and lands, an area rings where it was aimed and flashes every cell it
 * covers, and a heal lifts off them all.
 */
export function playImpact(scene: Phaser.Scene, impact: AbilityImpact, drawing: ImpactDrawing): void {
  switch (impact.kind) {
    case 'shot': {
      // The shot of a class is the effect its basic attack throws at reach, and the heavier landing
      // flash is what tells the two apart on the board.
      const to = drawing.at(impact.cell);
      if (drawing.from !== null) playEffect(scene, impact.effect, drawing.from, to);
      flash(scene, impact.effect.color, to, ABILITY_HIT.size, ABILITY_HIT.durationMs);
      break;
    }

    case 'blast':
      blast(scene, impact.cell, impact.cells, impact.color, drawing);
      break;

    case 'glow':
      glow(scene, impact.cells, impact.color, drawing);
      break;
  }
}

/** The ring on the aim, and a flash sweeping the cells of the area in reading order. */
function blast(
  scene: Phaser.Scene,
  cell: Position,
  cells: readonly Position[],
  color: number,
  drawing: ImpactDrawing,
): void {
  const aim = drawing.at(cell);
  const ring = scene.add.graphics().setDepth(LAYER.effect);
  ring.lineStyle(BLAST_RING.width, color, 1);
  ring.strokeCircle(aim.x, aim.y, BLAST_RING.radius);

  scene.tweens.add({
    targets: ring,
    alpha: 0,
    duration: BLAST_RING.durationMs,
    onComplete: () => ring.destroy(),
  });

  cells.forEach((covered, index) => {
    const to = drawing.at(covered);
    const square = scene.add
      .rectangle(to.x, to.y, BLAST_FLASH.size, BLAST_FLASH.size, color)
      .setDepth(LAYER.effect)
      .setAlpha(0);
    const fade = { value: 1 };

    // The ring is where the eye starts and the flashes follow it out: the whole area lights up in the
    // order the engine lists its cells, which is why the delay is the index and nothing else.
    scene.tweens.add({
      targets: fade,
      value: 0,
      duration: BLAST_FLASH.durationMs,
      delay: index * BLAST_FLASH.staggerMs,
      onUpdate: () => square.setAlpha(fade.value),
      onComplete: () => square.destroy(),
    });
  });
}

/** A column of light rising off each cell of the area, one behind the other. */
function glow(
  scene: Phaser.Scene,
  cells: readonly Position[],
  color: number,
  drawing: ImpactDrawing,
): void {
  cells.forEach((covered, index) => {
    const to = drawing.at(covered);
    const column = scene.add
      .rectangle(to.x, to.y, HEAL_GLOW.width, HEAL_GLOW.height, color)
      .setDepth(LAYER.effect);

    scene.tweens.add({
      targets: column,
      y: to.y - HEAL_GLOW.rise,
      alpha: 0,
      duration: HEAL_GLOW.durationMs,
      delay: index * HEAL_GLOW.staggerMs,
      onComplete: () => column.destroy(),
    });
  });
}

/**
 * Draws one attack effect between the two screen points the scene gives it: the bodies of the two
 * figures, except for the column, which lands on the centre of the target's top face. The impact
 * always ends on the target, whatever the kind of the effect.
 */
export function playEffect(scene: Phaser.Scene, effect: Effect, from: Pixel, to: Pixel): void {
  switch (effect.kind) {
    case 'pistol-flash':
      flash(scene, effect.color, towards(from, to), PISTOL_FLASH.size, PISTOL_FLASH.durationMs);
      break;
    case 'glow-impact':
      flash(scene, effect.color, to, GLOW_IMPACT.size, GLOW_IMPACT.durationMs);
      break;
    case 'tracer':
      tracer(scene, effect, from, to);
      break;
    case 'sky-column':
      skyColumn(scene, effect, to);
      break;
    case 'gust':
      gust(scene, from, to);
      break;
    case 'missiles':
      missiles(scene, effect, from, to);
      break;
  }

  scene.time.delayedCall(effect.travelMs, () => burst(scene, effect.color, to));
}

/** A point at the near edge of the actor's own tile, on the side the target stands. */
function towards(from: Pixel, to: Pixel): Pixel {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;

  return { x: from.x + (dx / length) * (TILE_W / 3), y: from.y + (dy / length) * (TILE_W / 3) };
}

function flash(scene: Phaser.Scene, color: number, at: Pixel, size: number, durationMs: number): void {
  const square = scene.add.rectangle(at.x, at.y, size, size, color).setDepth(LAYER.effect);
  scene.time.delayedCall(durationMs, () => square.destroy());
}

function tracer(scene: Phaser.Scene, effect: Effect, from: Pixel, to: Pixel): void {
  const line = scene.add.graphics().setDepth(LAYER.effect);
  line.lineStyle(2, effect.color, 1);
  line.lineBetween(from.x, from.y, to.x, to.y);

  scene.tweens.add({
    targets: line,
    alpha: 0,
    duration: effect.travelMs,
    onComplete: () => line.destroy(),
  });
}

/** The column drops from above and comes to rest on the centre of the target's top face. */
function skyColumn(scene: Phaser.Scene, effect: Effect, to: Pixel): void {
  const column = scene.add
    .rectangle(to.x, to.y - COLUMN.height, COLUMN.width, COLUMN.height, effect.color)
    .setDepth(LAYER.effect);

  scene.tweens.add({
    targets: column,
    y: to.y,
    alpha: 0,
    duration: effect.travelMs,
    onComplete: () => column.destroy(),
  });
}

function gust(scene: Phaser.Scene, from: Pixel, to: Pixel): void {
  const at = towards(from, to);
  const arcs = scene.add.graphics().setDepth(LAYER.effect);
  arcs.lineStyle(2, PAPER_COLOR, GUST.alpha);

  for (let i = 0; i < GUST.arcs; i += 1) {
    arcs.beginPath();
    arcs.arc(at.x, at.y, GUST.firstRadius + i * GUST.radiusStep, -Math.PI / 3, Math.PI / 3);
    arcs.strokePath();
  }

  scene.tweens.add({
    targets: arcs,
    alpha: 0,
    duration: GUST.durationMs,
    onComplete: () => arcs.destroy(),
  });
}

function missiles(scene: Phaser.Scene, effect: Effect, from: Pixel, to: Pixel): void {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // Straight across the line of flight, so the three darts bow to the side instead of overlapping.
  const across = { x: -dy / length, y: dx / length };

  for (let i = 0; i < MISSILES.count; i += 1) {
    const bow = MISSILES.firstBow + i * MISSILES.bowStep;
    const control = { x: middle.x + across.x * bow, y: middle.y + across.y * bow };
    const dart = scene.add
      .rectangle(from.x, from.y, MISSILES.size, MISSILES.size, effect.color)
      .setDepth(LAYER.effect);
    const progress = { value: 0 };

    scene.tweens.add({
      targets: progress,
      value: 1,
      duration: effect.travelMs,
      delay: i * effect.staggerMs,
      onUpdate: () => dart.setPosition(...pathAt(from, control, to, progress.value)),
      onComplete: () => dart.destroy(),
    });
  }
}

/** The point at `t` of the quadratic curve through `from`, `control` and `to`, as a pair. */
function pathAt(from: Pixel, control: Pixel, to: Pixel, t: number): [number, number] {
  const rest = 1 - t;
  const x = rest * rest * from.x + 2 * rest * t * control.x + t * t * to.x;
  const y = rest * rest * from.y + 2 * rest * t * control.y + t * t * to.y;

  return [x, y];
}

/** The bits of colour that scatter out of the target when the attack lands. */
function burst(scene: Phaser.Scene, color: number, at: Pixel): void {
  for (let i = 0; i < PARTICLE.count; i += 1) {
    const angle = (i / PARTICLE.count) * Math.PI * 2;
    const particle = scene.add.rectangle(at.x, at.y, PARTICLE.size, PARTICLE.size, color).setDepth(LAYER.effect);

    scene.tweens.add({
      targets: particle,
      x: at.x + Math.cos(angle) * PARTICLE.spread,
      y: at.y + Math.sin(angle) * PARTICLE.spread,
      alpha: 0,
      duration: ATTACK_TIMELINE.impactLength,
      onComplete: () => particle.destroy(),
    });
  }
}
