// A small seeded random generator and shuffle, so a choice made "for the day" (today's problem, today's drill) is the same for everyone and on every visit.

/** A generator of numbers in [0, 1) that always gives the same sequence for the same integer seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The items in a shuffled order that depends only on `seed` (Fisher-Yates); the input is not changed. */
export function shuffled(items, seed) {
  const order = items.slice();
  const random = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
