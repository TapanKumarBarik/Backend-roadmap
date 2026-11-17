import { useEffect, useState } from 'react';
import '../../styles/focus.css';
import { FOCUS } from '../../config/focus.js';
import { STORAGE } from '../../config/index.js';
import { readStored, writeStored } from '../../lib/storage.js';
import { clock, minutesLeft, scrollRatio, sessionLeft } from '../../lib/focus/focus.js';
import { Button } from '../ui/Button.jsx';

// The little bar that stays on a lesson in focus mode (hooks/useFocusMode.js hides the rest of the page): how long is left to read, an optional timed session, and the
// way out. A session runs on the clock (its start is kept in this browser, so a reload does not lose it) and when it ends `onSessionDone` is called, once.
// `text` is whatever changes when the lesson's text arrives, so the length of the page is measured again.
export default function FocusBar({ minutes, text, onExit, onSessionDone, onToast }) {
  const [ratio, setRatio] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Number(readStored(STORAGE.focusSession)) || 0);
  const [now, setNow] = useState(() => Date.now());
  const session = startedAt ? sessionLeft(startedAt, now, FOCUS.session.minutes) : null;

  useEffect(() => {
    const scroller = document.getElementById('main');
    if (!scroller) return undefined;
    let frame = 0;
    const draw = () => { frame = 0; setRatio(scrollRatio(scroller)); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(draw); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    draw();
    return () => { scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [text]);

  // The clock: once a second while a session runs, and at once when a tab that was in the background comes back (its timers were slowed).
  useEffect(() => {
    if (!startedAt) return undefined;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, FOCUS.session.tickMs);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [startedAt]);

  const over = !!session && session.over;
  useEffect(() => {
    if (!over) return;
    writeStored(STORAGE.focusSession, '');
    setStartedAt(0);
    onSessionDone();
  }, [over, onSessionDone]);

  const start = () => {
    const at = Date.now();
    writeStored(STORAGE.focusSession, String(at));
    setNow(at);
    setStartedAt(at);
  };
  const stop = () => {
    writeStored(STORAGE.focusSession, '');
    setStartedAt(0);
    onToast(FOCUS.session.stopped);
  };

  const left = minutesLeft(minutes, ratio);
  return (
    <div className="focus-bar" role="region" aria-label={FOCUS.bar.label}>
      <span className="focus-bar__left">{minutes > 0 ? (left === 0 ? FOCUS.bar.end : FOCUS.bar.left(left)) : FOCUS.bar.label}</span>
      {session && !session.over
        ? (
          <>
            <span className="focus-bar__clock" role="timer" aria-label={FOCUS.session.label}>{clock(session.left)}</span>
            <Button size="sm" variant="ghost" onClick={stop}>{FOCUS.session.stop}</Button>
          </>
        )
        : <Button size="sm" variant="secondary" title={FOCUS.session.help} onClick={start}>{FOCUS.session.start(FOCUS.session.minutes)}</Button>}
      <Button size="sm" variant="ghost" onClick={onExit}>{FOCUS.bar.exit}</Button>
    </div>
  );
}
