import { stash } from './htmlStash.js';
import { embedUrl, isVideoId, youtubeId, videoCardHtml, DEFAULT_VIDEO_LABEL, PLAYER_ALLOW } from './videoCard.js';

// The addresses and the card's markup are in videoCard.js (they need no browser, so the articles' renderer in the API
// can use them too). They are re-exported here, which is where the rest of the app has always imported them from.
export * from './videoCard.js';

// A video in a module is one ordinary Markdown link on a line of its own:
//
//   [Watch the walkthrough](https://www.youtube.com/watch?v=VIDEO_ID)
//
// On GitHub that is just a link, so the module reads the same there. Here the line becomes a card: the video's
// thumbnail with a play button. Nothing from YouTube is loaded until the reader presses play (a lone thumbnail is a
// plain image), and the player that then opens is YouTube's no-cookie one. Without JavaScript the card is still a
// link to the video. See docs/VIDEOS.md.

const FENCE = /^(`{3,}|~{3,})/;
const LINK_LINE = /^\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

// Runs before marked sees the document, like renderBlocks, and for the same reason stashes what it makes.
// Never inside a fenced code block: a module showing this very syntax keeps its example.
export function renderVideos(md, store) {
  let fenceChar = null;
  return md.split('\n').map((line) => {
    const fence = line.match(FENCE);
    if (fence) {
      if (!fenceChar) fenceChar = fence[1][0];
      else if (fenceChar === fence[1][0]) fenceChar = null;
    }
    if (fenceChar) return line;
    const link = LINK_LINE.exec(line);
    const id = link && youtubeId(link[2]);
    return id ? stash(store, videoCardHtml(id, link[1])) : line;
  }).join('\n');
}

// The reader pressed play: the thumbnail gives way to the player, in the same box so nothing around it moves.
export function playVideo(card) {
  const id = card.dataset.video;
  if (!isVideoId(id)) return;
  const frame = document.createElement('iframe');
  frame.src = embedUrl(id);
  frame.title = (card.querySelector('.video-label') || {}).textContent || DEFAULT_VIDEO_LABEL;
  frame.allow = PLAYER_ALLOW;
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  card.classList.add('playing');
  card.replaceChildren(frame);
}
