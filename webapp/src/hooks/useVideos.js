import { useEffect, useMemo, useState } from 'react';
import { groupByModule } from '../lib/curriculum/videos.js';

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
 * `null` until the videos have loaded (or if they could not be), then
 * `{ videos, playlists, byFile }`: every video in the order the playlists list them, the playlists, and the videos of
 * each module keyed by the module's README.md.
 */
export function useVideos() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    load().then((d) => { if (!cancelled && d && Array.isArray(d.videos) && d.videos.length) setData(d); });
    return () => { cancelled = true; };
  }, []);
  return useMemo(
    () => (data ? { videos: data.videos, playlists: data.playlists || [], byFile: groupByModule(data.videos) } : null),
    [data]
  );
}
