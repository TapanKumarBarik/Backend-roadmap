// What the flash card deck says (components/practice/CardDeck.jsx). Its own file, so it is downloaded with the deck and not with the Practice screen. The rest of
// the words and rules for cards (the switch, the length a set may have) are in config/practice.js, where the list and the API need them.
export const DECK = {
  label: 'Flash cards',
  front: 'Question',
  back: 'Answer',
  flip: 'Show the answer',
  hint: 'You can also click the card.',
  again: 'Not yet',
  gotIt: 'Got it',
  keys: 'Keys: Space shows the answer, then the left arrow is Not yet and the right arrow is Got it.',
  left: (n) => `${n} left`,
  gotCount: (done, total) => `${done} of ${total} got`,
  progressLabel: 'Cards got',
  restart: 'Shuffle and start again',
  finished: 'You have got every card',
  finishedClean: (n) => (n === 1 ? 'That card did not need a second go.' : `All ${n} cards, and none needed a second go.`),
  finishedMissed: (n) => (n === 1 ? 'One card needed another go:' : `${n} cards needed another go:`),
  retryMissed: (n) => (n === 1 ? 'Practise the one I missed' : `Practise the ${n} I missed`),
  all: 'Go through all of them again'
};
