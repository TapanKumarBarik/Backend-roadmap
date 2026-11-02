import { useEffect, useRef } from 'react';

// The thin line along the top of a page that fills as it is read: how far down the scroller (the app's #main) the reader has got.
// It is drawn with a transform on one animation frame at a time, so scrolling never lays the page out again, and it is hidden from
// screen readers (it says nothing a scrollbar does not). `text` is whatever changes when new text arrives, so it is measured again.
export default function ReadingProgress({ text }) {
  const bar = useRef(null);
  useEffect(() => {
    const scroller = document.getElementById('main');
    if (!scroller) return undefined;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, scroller.scrollTop / max) : 0})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(draw); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    draw();
    return () => { scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [text]);
  return <div className="read-progress" aria-hidden="true"><i ref={bar} /></div>;
}
