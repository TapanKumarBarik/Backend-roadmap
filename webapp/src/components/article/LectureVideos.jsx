import { useState } from 'react';
import { PlayIcon, YoutubeIcon } from '../common/icons.jsx';
import { PLAYER_ALLOW, embedUrl, thumbnailUrl, watchUrl } from '../../lib/markdown/video.js';
import { formatClock, nextVideo } from '../../lib/curriculum/videos.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { followInApp } from '../../lib/linkClick.js';
import { LECTURE } from '../../config/videos.js';
import '../../styles/video.css';

// The video (or videos) of a module, from the channel's registry (content/videos.json, docs/VIDEOS.md), shown at the top of
// the module. It is the same card as a video written into a module's text: the thumbnail and a play button, and nothing
// is fetched from YouTube until the reader presses play. Beneath it are the video's chapters, each of which starts the
// player at that point. A module with several videos shows one at a time and lists the others.
export default function LectureVideos({ videos, playlists, allVideos = [], onOpenFile }) {
  const [picked, setPicked] = useState(0);
  // null: the thumbnail is showing; a number: the player is open and started at that second.
  const [start, setStart] = useState(null);
  const video = videos[picked] || videos[0];
  const playlist = playlists.find((p) => p.id === video.playlist);
  const playing = start !== null;
  // The video after this one in its playlist: its lesson when it has one (so the text comes with it), else the video itself.
  const next = nextVideo(allVideos, video);
  const current = playing ? video.chapters.reduce((at, [t], i) => (t <= start ? i : at), -1) : -1;

  function choose(i) {
    setPicked(i);
    setStart(null);
  }

  // A click meant for a new tab is left to the browser; an ordinary one opens the player in place.
  function onPoster(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setStart(0);
  }

  return (
    <section className="lecture" aria-label={videos.length > 1 ? LECTURE.many : LECTURE.one}>
      <figure className={'video' + (playing ? ' playing' : '')} data-video={video.id}>
        {playing
          ? (
            <iframe
              key={start}
              src={embedUrl(video.id, start)}
              title={video.title}
              allow={PLAYER_ALLOW}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )
          : (
            <a className="video-link" href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer" onClick={onPoster} aria-label={LECTURE.play(video.title)}>
              <img src={thumbnailUrl(video.id)} alt="" width="480" height="360" decoding="async" />
              <span className="video-play" aria-hidden="true" />
              <span className="video-label">{video.title}</span>
              {video.seconds && <span className="video-time">{formatClock(video.seconds)}</span>}
            </a>
          )}
      </figure>

      <div className="lecture-meta">
        <span className="lecture-kind"><PlayIcon aria-hidden="true" />{LECTURE.kind}</span>
        {video.seconds && <span>{formatClock(video.seconds)}</span>}
        {playlist && <a href={playlist.url} target="_blank" rel="noopener noreferrer">{playlist.title}</a>}
        <a className="lecture-yt" href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer">
          <YoutubeIcon aria-hidden="true" />{LECTURE.watchOnYouTube}
        </a>
      </div>

      {next && (
        <p className="lecture-next">
          <span className="lecture-h">{LECTURE.next}</span>{' '}
          {next.file
            ? <a href={routeUrl(next.file)} onClick={followInApp(() => onOpenFile(next.file))}>{next.title}</a>
            : <a href={watchUrl(next.id)} target="_blank" rel="noopener noreferrer">{next.title}</a>}
        </p>
      )}

      {video.chapters.length > 0 && (
        <div className="lecture-chapters">
          <div className="lecture-h" id={`chapters-${video.id}`}>{LECTURE.chapters}</div>
          <ol aria-labelledby={`chapters-${video.id}`}>
            {video.chapters.map(([t, name], i) => (
              <li key={t}>
                <button
                  type="button"
                  className="lecture-chapter"
                  aria-current={i === current ? 'true' : undefined}
                  aria-label={LECTURE.playAt(formatClock(t), name)}
                  onClick={() => setStart(t)}
                >
                  <span className="ts">{formatClock(t)}</span>
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {videos.length > 1 && (
        <div className="lecture-more">
          <div className="lecture-h">{LECTURE.moreHeading(videos.length)}</div>
          <ul>
            {videos.map((v, i) => (
              <li key={v.id}>
                <button type="button" className="lecture-pick" aria-current={i === picked ? 'true' : undefined} onClick={() => choose(i)}>
                  <img src={thumbnailUrl(v.id)} alt="" width="96" height="54" loading="lazy" decoding="async" />
                  <span className="lecture-pick-t">{v.title}</span>
                  {v.seconds && <span className="lecture-pick-d">{formatClock(v.seconds)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
