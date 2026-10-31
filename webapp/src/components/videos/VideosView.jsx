import { useMemo, useState } from 'react';
import { SearchIcon, YoutubeIcon } from '../common/icons.jsx';
import { formatTotal, totals } from '../../lib/curriculum/videos.js';
import VideoCard from './VideoCard.jsx';
import { YOUTUBE } from '../../config/index.js';
import { VIDEOS_PAGE } from '../../config/videos.js';
import '../../styles/videos.css';

// Every video on the channel, in course order, grouped by playlist. A video goes to the module it belongs to (where it
// plays at the top, with the written version underneath); one with no module yet goes to YouTube. The list is
// content/videos.json, kept up to date by `npm run videos:sync` (docs/VIDEOS.md).
export default function VideosView({ videoData, nodeByFile, onOpenFile }) {
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState('all');

  const { videos, playlists } = videoData || { videos: [], playlists: [] };
  const all = useMemo(() => totals(videos), [videos]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (only !== 'all' && v.playlist !== only) return false;
      if (!needle) return true;
      const where = v.file && nodeByFile[v.file] ? nodeByFile[v.file].title : '';
      return `${v.title} ${v.summary} ${where}`.toLowerCase().includes(needle);
    });
  }, [videos, nodeByFile, query, only]);

  const groups = playlists
    .map((p) => ({ playlist: p, items: shown.filter((v) => v.playlist === p.id), total: totals(videos.filter((v) => v.playlist === p.id)) }))
    .filter((g) => g.items.length);

  return (
    <div id="empty" className="vid-screen">
      <div className="vid-head">
        <div>
          <h2>{VIDEOS_PAGE.heading}</h2>
          {videos.length > 0 && <p className="home-sub">{VIDEOS_PAGE.sub(all.count, all.seconds)}</p>}
        </div>
        <a className="vid-sub-btn" href={YOUTUBE.channel} target="_blank" rel="noopener noreferrer">
          <YoutubeIcon aria-hidden="true" /> {VIDEOS_PAGE.subscribe}
        </a>
      </div>

      {videos.length === 0
        ? <p>{VIDEOS_PAGE.empty}</p>
        : (
          <>
            <div className="vid-tools">
              <label className="vid-filter">
                <SearchIcon aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={VIDEOS_PAGE.filterPlaceholder}
                  aria-label={VIDEOS_PAGE.filterLabel}
                />
              </label>
              <div className="vid-chips" role="group" aria-label={VIDEOS_PAGE.filterLabel}>
                <button type="button" className="vid-chip" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>{VIDEOS_PAGE.all}</button>
                {playlists.map((p) => (
                  <button key={p.id} type="button" className="vid-chip" aria-pressed={only === p.id} onClick={() => setOnly(p.id)}>{p.title}</button>
                ))}
              </div>
              <span className="vid-count" aria-live="polite">{VIDEOS_PAGE.count(shown.length, videos.length)}</span>
            </div>

            {groups.length === 0 && <p>{VIDEOS_PAGE.none}</p>}

            {groups.map(({ playlist, items, total }) => (
              <section key={playlist.id} className="vid-group" aria-labelledby={`vid-g-${playlist.id}`}>
                <div className="vid-group-h">
                  <h3 id={`vid-g-${playlist.id}`}>{playlist.title}</h3>
                  <span>{total.count} videos · {formatTotal(total.seconds)}</span>
                  <a href={playlist.url} target="_blank" rel="noopener noreferrer">{VIDEOS_PAGE.playlist}</a>
                </div>
                <ul className="vid-grid">
                  {items.map((v) => (
                    <li key={v.id}><VideoCard video={v} node={v.file ? nodeByFile[v.file] : null} onOpenFile={onOpenFile} /></li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
    </div>
  );
}
