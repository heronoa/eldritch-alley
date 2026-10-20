// A stand-in for Phaser in the Node test run, so a scene can be built and driven without a canvas.
//
// Every property is another stand-in and every call returns one, and a class that extends it gets
// an ordinary instance of its own, so `class MatchScene extends Phaser.Scene` works. What the scene
// draws is not checked by the tests that use this: they read what the scene decides and hands over.
export function stub(): any {
  const target = function stubbed() {};

  return new Proxy(target, {
    get: (_target, property) => {
      if (property === 'then') return undefined;
      if (property === Symbol.toPrimitive) return () => 0;
      return stub();
    },
    set: () => true,
    apply: () => stub(),
    construct: (_target, _args, newTarget) => Object.create(newTarget.prototype),
  });
}
