// Playing a deck of flash cards (cards.js makes the cards): a deck keeps a card coming back until the reader has marked it "got it". Pure: the cards and a seed come in,
// the deck goes out; the screen (components/practice/CardDeck.jsx) holds the deck in its state. Nothing is kept between visits: a deck is a sitting, not a score (the
// review queue, lib/practice/review.js, is what brings things back after days).
import { shuffled } from './seeded.js';

/**
 * A new deck of `cards`, in a shuffled order that depends only on `seed` (left as they come when there is no seed).
 * `queue` is the keys still to get, the one on top first; `done` the keys got; `missed` the keys that were marked "not yet" at least once, in the order they were.
 */
export function startDeck(cards, seed) {
  const order = seed === undefined ? cards : shuffled(cards, seed);
  return { cards, queue: order.map((card) => card.key), done: [], missed: [] };
}

/** The card on top, or null when the deck is finished. */
export const topCard = (deck) => deck.cards.find((card) => card.key === deck.queue[0]) || null;

/** Whether every card has been got. */
export const isFinished = (deck) => deck.queue.length === 0;

/** How far along: the cards got, the cards still to get, and the cards in the deck. */
export const progressOf = (deck) => ({ done: deck.done.length, left: deck.queue.length, total: deck.cards.length });

/** The cards that needed another go, in the order they were missed. */
export const missedCards = (deck) => deck.missed.map((key) => deck.cards.find((card) => card.key === key)).filter(Boolean);

/**
 * The deck after the card on top was marked. One that was got is done; one that was not goes to the back of the queue, so it comes again after the others (at once,
 * when it is the last one left), and is remembered as missed. The deck given is not changed.
 */
export function mark(deck, gotIt) {
  if (!deck.queue.length) return deck;
  const [top, ...rest] = deck.queue;
  if (gotIt) return { ...deck, queue: rest, done: [...deck.done, top] };
  return { ...deck, queue: [...rest, top], missed: deck.missed.includes(top) ? deck.missed : [...deck.missed, top] };
}
