// WCAG 2.x contrast, in one place: the palette is picked against these numbers and the tests check
// the palette with the same code that the modules use. Plain arithmetic, no Phaser.

/** Relative luminance of a 24-bit colour, 0..1, as WCAG defines it. */
export function luminance(color: number): number {
  const channels = [16, 8, 0].map((shift) => {
    const value = ((color >> shift) & 0xff) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two colours, 1..21, as WCAG defines it. Order does not matter. */
export function contrastRatio(a: number, b: number): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
