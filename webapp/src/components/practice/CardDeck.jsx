import { useEffect, useRef, useState } from 'react';
import { DECK } from '../../config/cards.js';
import { isFinished, mark, missedCards, progressOf, startDeck, topCard } from '../../lib/practice/deck.js';
import { Button } from '../ui/Button.jsx';
import ContentMarkdown from './ContentMarkdown.jsx';

const freshSeed = () => Math.floor(Math.random() * 2 ** 32);

// Flash cards for a set of interview questions (lib/practice/deck.js): the question on a card, and a click on the card (or Space) turns it over to the model
// answer. The reader says which they got: a card marked "Not yet" goes to the back and comes again, so the deck ends when every card has been got. Nothing is
// kept, it is rehearsal. The answer is read out when the card turns (focus moves to it); the arrow keys mark it, so a deck can be run without the mouse.
// `cards` is [{ key, front, back }] (lib/practice/cards.js cardsOf); the back is markdown.
export default function CardDeck({ cards }) {
  const [deck, setDeck] = useState(() => startDeck(cards, freshSeed()));
  const [flipped, setFlipped] = useState(false);
  const [turn, setTurn] = useState(0); // counts cards marked, so the focus goes back to the button for the next one even when it is the same card again
  const flipButton = useRef(null);
  const answer = useRef(null);
  const done = useRef(null);
  const card = topCard(deck);
  const finished = isFinished(deck);
  const stats = progressOf(deck);
  const missed = missedCards(deck);

  // Focus follows what the reader is meant to do next: read the answer once the card is turned, press the button for the next question, read the result at the end.
  useEffect(() => {
    if (flipped && answer.current) answer.current.focus();
  }, [flipped]);
  useEffect(() => {
    if (turn === 0) return;
    if (finished) { if (done.current) done.current.focus(); } else if (flipButton.current) flipButton.current.focus();
  }, [turn, finished]);

  const grade = (gotIt) => {
    if (!flipped || finished) return;
    setDeck((old) => mark(old, gotIt));
    setFlipped(false);
    setTurn((n) => n + 1);
  };
  const begin = (next) => { setDeck(next); setFlipped(false); setTurn((n) => n + 1); };
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !flipped) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); grade(true); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); grade(false); }
  };

  return (
    <section className="cd" aria-label={DECK.label} onKeyDown={onKeyDown}>
      <div className="pr-progress cd-progress">
        <p className="pr-progress__text">{finished ? DECK.gotCount(stats.done, stats.total) : `${DECK.left(stats.left)} · ${DECK.gotCount(stats.done, stats.total)}`}</p>
        <div className="pr-progress__bar" role="progressbar" aria-label={DECK.progressLabel} aria-valuemin={0} aria-valuemax={stats.total} aria-valuenow={stats.done}>
          <span style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
        </div>
      </div>

      {finished ? (
        <div className="cd-done" tabIndex={-1} ref={done}>
          <h3>{DECK.finished}</h3>
          {missed.length === 0 ? <p>{DECK.finishedClean(stats.total)}</p> : (
            <>
              <p>{DECK.finishedMissed(missed.length)}</p>
              <ul>{missed.map((c) => <li key={c.key}>{c.front}</li>)}</ul>
            </>
          )}
          <div className="pr-actions">
            {missed.length > 0 && <Button variant="primary" onClick={() => begin(startDeck(missed, freshSeed()))}>{DECK.retryMissed(missed.length)}</Button>}
            <Button variant={missed.length > 0 ? 'secondary' : 'primary'} onClick={() => begin(startDeck(cards, freshSeed()))}>{DECK.all}</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Both faces sit in one grid cell, so the card is as tall as the longer of the two and does not jump when it turns. */}
          {/* A new card is a new element (the key), so the one before is not seen turning back with the next answer on it. */}
          <div key={`${card.key}-${turn}`} className={flipped ? 'cd-card is-flipped' : 'cd-card'} onClick={() => setFlipped(true)}>
            <div className="cd-face cd-face--front" aria-hidden={flipped || undefined} inert={flipped ? '' : undefined}>
              <p className="cd-label">{DECK.front}</p>
              <p className="cd-text">{card.front}</p>
              <p className="cd-hint">{DECK.hint}</p>
            </div>
            <div className="cd-face cd-face--back" aria-hidden={!flipped || undefined} inert={flipped ? undefined : ''}>
              <p className="cd-label">{DECK.back}</p>
              <div className="cd-answer" tabIndex={-1} ref={answer} aria-label={DECK.back} role="group">
                <ContentMarkdown text={card.back} />
              </div>
            </div>
          </div>
          <div className="pr-actions cd-actions">
            {flipped ? (
              <>
                <Button onClick={() => grade(false)}>{DECK.again}</Button>
                <Button variant="primary" onClick={() => grade(true)}>{DECK.gotIt}</Button>
              </>
            ) : (
              <Button variant="primary" ref={flipButton} onClick={() => setFlipped(true)}>{DECK.flip}</Button>
            )}
            <Button variant="ghost" size="sm" className="cd-restart" onClick={() => begin(startDeck(cards, freshSeed()))}>{DECK.restart}</Button>
          </div>
          <p className="pr-note cd-keys">{DECK.keys}</p>
        </>
      )}
    </section>
  );
}
