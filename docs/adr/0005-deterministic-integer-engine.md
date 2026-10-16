# 0005. Deterministic engine with integer math

**Status:** Accepted

## Context

The pitch promises that every match is verifiable: the same seed and the same actions always produce the same result, so a match can be replayed and audited. Floating-point arithmetic and ambient inputs such as the clock or `Math.random` break that promise, because results can differ between runtimes or between runs.

## Decision

- The engine never calls `Math.random`, `Date`, or any clock. Randomness comes only from the seed.
- Line of sight uses an integer algorithm over the grid (Bresenham or an equivalent).
- Hit chance and damage use integer percentages.
- No rule calculation uses floating-point numbers.
