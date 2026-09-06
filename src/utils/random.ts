// src/utils/random.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of randomness for the game.
//
// This is Math.random()-based, which is correct for a party game: nothing in
// Sip Happens is security-sensitive. There are no tokens, keys, passwords,
// sessions or money anywhere in the app. The worst case for a predictable
// sequence is that someone could theoretically guess which dare comes next.
//
// It is centralised for two reasons:
//
//   1. The security scanner flags every Math.random() call site as a weak
//      cryptographic RNG. That's a false positive here, but with a dozen call
//      sites it meant a dozen suppression comments scattered through the game
//      logic. Now there is exactly one, in one place, with the reasoning next
//      to it.
//
//   2. If we ever want deterministic tests, or a "replay this game" feature,
//      swapping in a seeded PRNG means changing this file only.
//
// If you need randomness in game code, import from here rather than calling
// Math.random() directly — otherwise the scanner will flag your new call site
// and block CI.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one and only entry point to the underlying RNG.
 *
 * nosemgrep justification: party-game shuffling, not cryptography. See the
 * module comment above for why Math.random() is the right choice here.
 */
// nosemgrep
const nextFloat = (): number => Math.random(); // nosemgrep

/** Random integer in [0, maxExclusive). Returns 0 for a non-positive bound. */
export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(nextFloat() * maxExclusive);
}

/** True with the given probability (0–1). */
export function chance(probability: number): boolean {
  return nextFloat() < probability;
}

/** True half the time. */
export function coinFlip(): boolean {
  return nextFloat() < 0.5;
}

/**
 * A random element. Callers are expected to guard against empty arrays — the
 * game logic always does, and returning undefined loudly is better than
 * silently substituting a wrong item.
 */
export function pickOne<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
