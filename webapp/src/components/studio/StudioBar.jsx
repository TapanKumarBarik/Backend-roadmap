import { useLayoutEffect, useRef } from 'react';
import { SAVE_STATUS, POST_STATUS } from '../../config/studio.js';
import { plural, readingTime } from '../../lib/blog/format.js';
import { Button } from '../ui/Button.jsx';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu.jsx';
import { MenuDotsIcon } from '../common/icons.jsx';

// The bar across the top of the studio: the way back, what is happening to the writing (saved or not, said honestly), how
// long it is, and the few things done with the article as a whole: preview it, write without distractions, publish it.
export default function StudioBar({ status, postStatus, counts, preview, focus, assistant, assistantOpen, onBack, onRetry, onPreview, onFocus, onAssistant, onHelp, onHistory, onPublish, onView, onDelete, canPublish }) {
  const trouble = status === 'error' || status === 'offline';
  const publishLabel = postStatus === 'published' ? 'Settings' : postStatus === 'scheduled' ? 'Scheduled' : 'Publish';

  // The writing assistant starts where the bar ends. The bar wraps onto a second line in a narrow window, so how tall it is
  // is measured, and the page (.studio) is told as --studio-bar-h.
  const bar = useRef(null);
  useLayoutEffect(() => {
    const el = bar.current;
    const page = el && el.parentElement;
    if (!page || typeof ResizeObserver === 'undefined') return undefined;
    const tell = () => page.style.setProperty('--studio-bar-h', `${el.offsetHeight}px`);
    tell();
    const watch = new ResizeObserver(tell);
    watch.observe(el);
    return () => { watch.disconnect(); page.style.removeProperty('--studio-bar-h'); };
  }, []);

  return (
    <header className="studio-bar" ref={bar}>
      <div className="studio-bar__left">
        <a className="studio-bar__back" href="/write/" onClick={(e) => { e.preventDefault(); onBack(); }}>← Your articles</a>
        <span className={`studio-status is-${status}`} role="status" aria-live="polite">
          <span className="studio-status__dot" aria-hidden="true" />
          {SAVE_STATUS[status]}
        </span>
        {trouble && <Button variant="ghost" size="sm" onClick={onRetry}>Try now</Button>}
        <span className={`studio-chip is-${postStatus}`}>{POST_STATUS[postStatus]}</span>
      </div>
      <div className="studio-bar__right">
        <span className="studio-counts">{plural(counts.words, 'word')} · {readingTime(counts.minutes)}</span>
        <Button variant="ghost" aria-pressed={preview} onClick={onPreview} title="Preview as readers will see it (Ctrl/⌘ Shift P)">{preview ? 'Back to writing' : 'Preview'}</Button>
        {assistant && !preview && <Button variant="ghost" aria-pressed={assistantOpen} onClick={onAssistant}>Assistant</Button>}
        <Button variant="ghost" aria-pressed={focus} onClick={onFocus} title="Focus mode (Ctrl/⌘ Shift F)">Focus</Button>
        <Menu trigger={<Button variant="ghost" icon={<MenuDotsIcon />} aria-label="More" />}>
          <MenuItem onSelect={onHistory}>Version history</MenuItem>
          <MenuItem onSelect={onHelp}>Keyboard shortcuts</MenuItem>
          {postStatus === 'published' && <MenuItem onSelect={onView}>View the article</MenuItem>}
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={onDelete}>Delete this article</MenuItem>
        </Menu>
        <Button variant="primary" disabled={!canPublish} onClick={onPublish}>{publishLabel}</Button>
      </div>
    </header>
  );
}
