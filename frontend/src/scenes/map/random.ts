// The prototype's own generator, `rnd` of `js/app.js`: a linear congruential one, seeded per call, so
// every window, awning and star of the map falls where the prototype put it.
//
// It is here rather than inside a drawing module because three of them need it — the sky, the buildings
// and their shops — and two generators that drifted apart would put the two drawings out of step.
// The arithmetic is the prototype's, integer for integer: the seed's first product and every step fit
// a double exactly, so the sequence this returns is the sequence the prototype draws with.
export function rnd(seed: number): () => number {
  let s = (seed * 2654435761) % 4294967296;

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
