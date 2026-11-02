import { isPlainClick } from '../linkClick.js';
import { playVideo } from './video.js';

// The two clicks that mean the same in every piece of rendered content, a module or an article: the copy button on a
// code block, and a video card (a link to the video until the reader presses play). Each returns true when the click
// was one of them, so the caller can stop looking at it.

/** The "Copy" button of a code block. `onFailed` is told when the browser would not copy. */
export function handleCopyClick(event, onFailed) {
  const button = event.target.closest('.cb-copy');
  if (!button) return false;
  const code = button.closest('.codeblock').querySelector('code');
  navigator.clipboard.writeText(code.textContent).then(
    () => {
      button.textContent = 'Copied';
      button.classList.add('ok');
      setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('ok'); }, 1400);
    },
    () => onFailed()
  );
  return true;
}

/** A video card: pressing play swaps the thumbnail for the player; a click meant for a new tab is left alone. */
export function handleVideoClick(event) {
  const link = event.target.closest('.video-link');
  if (!link || !isPlainClick(event)) return false;
  event.preventDefault();
  playVideo(link.closest('.video'));
  return true;
}
