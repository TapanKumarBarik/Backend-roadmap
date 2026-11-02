import { escapeHtml } from './escapeHtml.js';

// What a video card is made of, with nothing that needs a browser: the addresses of YouTube's own things and the card's
// markup. Shared by the modules' Markdown (video.js), the articles' renderer (lib/blog/renderDoc.js, which runs in the
// API) and the build. Pressing play, which needs the page, is in video.js.
//
// The URLs below are YouTube's own scheme, not settings of this site (the channel link is: site.config.json).

export const DEFAULT_VIDEO_LABEL = 'Watch the video on YouTube';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Whether `id` has the shape of a YouTube video id (the only kind that is ever put into markup or a URL). */
export const isVideoId = (id) => VIDEO_ID.test(id || '');

// The id of a single YouTube video from any of its usual links, or null for anything else (a channel, a playlist,
// another site). Only ids of the right shape get through, since the id ends up in markup.
export function youtubeId(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = (/^\/(?:embed|shorts|live)\/([^/?]+)/.exec(url.pathname) || [])[1] || null;
  } else if (host === 'youtu.be') {
    id = url.pathname.slice(1);
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
// `start` is the second to begin at (a chapter of a lecture), 0 for the beginning.
export const embedUrl = (id, start = 0) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start > 0 ? `&start=${Math.floor(start)}` : ''}`;
// 480x360 with black bars above and below a 16:9 picture; the card crops them (object-fit: cover).
export const thumbnailUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
// What the player may do; the same for a card in the text and a module's own video (components/article/LectureVideos.jsx).
export const PLAYER_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';

export function videoCardHtml(id, label) {
  const text = escapeHtml((label || '').trim() || DEFAULT_VIDEO_LABEL);
  return `<figure class="video" data-video="${id}">`
    + `<a class="video-link" href="${watchUrl(id)}" target="_blank" rel="noopener noreferrer">`
    + `<img src="${thumbnailUrl(id)}" alt="" width="480" height="360" loading="lazy" decoding="async">`
    + '<span class="video-play" aria-hidden="true"></span>'
    + `<span class="video-label">${text}</span>`
    + '</a></figure>';
}
