import { useEffect, useMemo, useState } from 'react';
import { groupByModule, isPublic } from '../lib/curriculum/videos.js';

// The channel's videos, resolved at build time into videos.json (scripts/build/gen-videos.mjs) from content/videos.json.
// Fetched once per page load and shared. A failure is not an error: everything that shows a video is written to show
// nothing without one, so a missing file only means pages without a video.
let pending = null;

function load() {
  if (!pending) {
    pending = fetch('/videos.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return pending;
}

/**
 * `undefined` while the videos are loading; `null` if there are none or they could not be loaded; then
 * `{ videos, playlists, byFile }`: every video in the order the playlists list them, the playlists, and the videos of
 * each module keyed by the module's README.md.
 */
export function useVideos() {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    load().then((d) => {
      if (cancelled) return;
      // A video scheduled on YouTube is private until its time: list it only from then on, so nothing on the site
      // points at a video nobody can watch yet.
      const now = Date.now();
      const live = d && Array.isArray(d.videos) ? d.videos.filter((v) => isPublic(v, now)) : [];
      setData(live.length ? { ...d, videos: live } : null);
    });
    return () => { cancelled = true; };
  }, []);
  return useMemo(
    () => (data ? { videos: data.videos, playlists: data.playlists || [], byFile: groupByModule(data.videos) } : data),
    [data]
  );
}
