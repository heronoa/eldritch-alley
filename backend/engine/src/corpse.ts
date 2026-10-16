// How long a defeated unit's body stays on its tile, by Nerve. The values are the owner's rule (see the
// debt-and-reaction plan). Integer comparisons only: no division, so the forbidden-pattern guard holds.

export function corpseRounds(nerve: number): number {
  if (!Number.isInteger(nerve) || nerve < 0 || nerve > 100) {
    throw new RangeError(`nerve must be an integer between 0 and 100, got ${nerve}`);
  }
  if (nerve < 50) return 3;
  if (nerve < 100) return 4;
  return 5;
}
