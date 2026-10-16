// How hard a finger drags the map (owner's request, after the smoke test).
//
// The drag used to be one to one with the pointer: the gesture reports the whole travel from where the
// finger went down, and the camera took all of it. This is the one knob over that travel, walked by the
// stepper of the settings panel in steps of a quarter.
//
// The setting lives in the browser only, like the automatic end of turn: reading or writing it never
// throws, because a browser that blocks storage must still be able to play. It is kept as a percentage
// rather than as a factor, because the percentage is what the panel shows and what is saved, and the
// conversion happens once, where a drag is read. The keys are not this setting's business: the
// multiplier is applied where a drag is taken, never inside the camera's own move.
import { browserStorage, type KeyValueStorage } from '../storage/browser';

/** One press of the − or the + of the panel moves the value by this many points. */
export const PAN_SENSITIVITY_STEP = 25;

/** The slowest drag the panel offers. At zero the map could not be dragged at all. */
export const PAN_SENSITIVITY_MIN = 25;

/** The drag the map had before this setting existed, and the fastest the panel offers. */
export const PAN_SENSITIVITY_MAX = 100;

/** The drag a match opens with until the player says otherwise (owner's decision). */
export const PAN_SENSITIVITY_DEFAULT = 50;

/** The key the setting is saved under. Namespaced, so the origin's other keys do not collide. */
export const PAN_SENSITIVITY_KEY = 'eldritch-alley.panSensitivity';

/** Whether a number is one of the steps the stepper can land on. */
export function isPanSensitivity(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= PAN_SENSITIVITY_MIN &&
    value <= PAN_SENSITIVITY_MAX &&
    (value - PAN_SENSITIVITY_MIN) % PAN_SENSITIVITY_STEP === 0
  );
}

/** The value after one press of the stepper, kept between the two ends: an end stays where it is. */
export function stepPanSensitivity(current: number, direction: 1 | -1): number {
  const next = current + direction * PAN_SENSITIVITY_STEP;
  return Math.min(PAN_SENSITIVITY_MAX, Math.max(PAN_SENSITIVITY_MIN, next));
}

/** The factor the travel of a finger is multiplied by: 100 is the drag the map always had. */
export function panFactor(percent: number): number {
  return percent / 100;
}

/**
 * The saved setting, or the default when there is none, when it is not a step of the panel, or when
 * storage fails. A value the panel cannot show is not rounded to the nearest step: that would put a
 * number on the screen the player never chose.
 */
export function readPanSensitivity(storage: KeyValueStorage | null = browserStorage()): number {
  try {
    const saved = storage?.getItem(PAN_SENSITIVITY_KEY);
    if (saved === null || saved === undefined) return PAN_SENSITIVITY_DEFAULT;

    const value = Number(saved);
    return isPanSensitivity(value) ? value : PAN_SENSITIVITY_DEFAULT;
  } catch {
    return PAN_SENSITIVITY_DEFAULT;
  }
}

/** Saves the setting, and does nothing when storage refuses it: the page still plays. */
export function savePanSensitivity(
  percent: number,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(PAN_SENSITIVITY_KEY, String(percent));
  } catch {
    // Nothing to do: without storage the choice simply does not outlive the page.
  }
}
