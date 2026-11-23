import { Suspense, lazy } from 'react';
import { ArrowRightIcon, SearchIcon, YoutubeIcon } from '../common/icons.jsx';
import SignInButton from '../account/SignInButton.jsx';
import SiteFooter from '../common/SiteFooter.jsx';
import VideoCard from '../videos/VideoCard.jsx';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { followInApp } from '../../lib/linkClick.js';
import { totals } from '../../lib/curriculum/videos.js';
import { YOUTUBE, DEVELOPER_EMAIL_LINK } from '../../config/index.js';
import { TRUST } from '../../config/trust.js';
import { PATH_ROUTE, pageUrl } from '../../lib/appPages.js';
import { FALLBACK_START_FILE, HERO, PICK, LIBRARY, VIDEO, ACCOUNT, OPEN_SOURCE } from '../../config/landing.js';
import '../../styles/landing.css';

// Its own chunk: the front door does not wait for the practice catalog or the page-view ranking.
const PracticeStrip = lazy(() => import('./PracticeStrip.jsx'));
const PopularLessons = lazy(() => import('./PopularLessons.jsx'));

// The front door, shown to someone who has not started yet (see hooks/useLanding.js). It has one job: help a newcomer choose
// where to begin. So it is six short sections in the order a newcomer asks the questions: what is this and what do I do first
// (hero), which route (paths), what else is there (subjects), can I practise (practice), can I watch (videos), and the small
// print (account, mistakes). This component only lays things out: the words are in config/landing.js and the numbers come from
// build-time stats. If the stats are missing the page still reads correctly, it just says less.
export default function Landing({ stats, videoData, nodeByFile, user, onLogin, onOpenFile, onStartPath, onDismiss, onOpenPalette, onOpenVideos, practice }) {
  const link = (file) => ({
    href: routeUrl(file),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let the browser open a new tab
      e.preventDefault();
      onOpenFile(file);
    }
  });

  // Starting a learning path picks it and opens its first module; the link still works in a new tab.
  const startLink = (p) => ({
    ...link(p.start),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      onStartPath(p.id, p.start);
    }
  });

  const modules = stats?.modules;
  const startFile = stats?.curricula?.backend?.start || FALLBACK_START_FILE;
  const paths = stats?.paths || [];
  const flagshipPaths = paths.filter((p) => p.flagship);
  const displayPaths = flagshipPaths.length > 0 ? flagshipPaths : paths.slice(0, 4);
  const heroPath = paths.find((p) => p.id === HERO.startPath) || displayPaths[0];

  // The newest videos, and what they add up to. Without them (they could not be loaded) the page says less.
  const videos = videoData?.videos || [];
  const newest = [...videos].sort((a, b) => (a.published < b.published ? 1 : -1)).slice(0, VIDEO.shown);
  const videoTotals = totals(videos);

  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-h1">
        <p className="lp-eyebrow">{HERO.eyebrow}</p>
        <h1 id="lp-h1">{HERO.headline}</h1>
        <p className="lp-lead">{HERO.lead(modules)}</p>
        <div className="lp-cta">
          {heroPath
            ? <a className="lp-btn lp-btn-primary" {...startLink(heroPath)}>{HERO.startLabel} <ArrowRightIcon /></a>
            : <a className="lp-btn lp-btn-primary" {...link(startFile)}>{HERO.startLabel} <ArrowRightIcon /></a>}
          <a className="lp-btn" href={pageUrl(PATH_ROUTE)} onClick={followInApp(practice.onOpenPaths)}>{HERO.exploreLabel}</a>
        </div>
        <button type="button" className="lp-search" onClick={onOpenPalette}>
          <SearchIcon />
          <span>{HERO.searchLabel(modules)}</span>
        </button>
        <p className="lp-facts">{HERO.facts(modules, videoTotals.count)}</p>
      </section>

      {paths.length > 0 && (
        <section className="lp-sec" aria-labelledby="lp-pick">
          <h2 id="lp-pick">{PICK.heading}</h2>
          <p className="lp-sec-sub">{PICK.sub}</p>
          <div className="lp-paths">
            {displayPaths.map((p) => (
              <article key={p.id} className="lp-card">
                <div className="lp-topic">{p.topic}</div>
                <h3>{p.title}</h3>
                <p>{p.goal}</p>
                {p.milestone && <p className="lp-project">{PICK.projectLabel(p.milestone.title)}</p>}
                <div className="lp-meta">{PICK.meta(p)}</div>
                <div className="lp-card-acts">
                  <a className="lp-link lp-link-strong" {...startLink(p)}>{PICK.startLabel} <ArrowRightIcon /></a>
                </div>
              </article>
            ))}
          </div>
          <p className="lp-more">
            <a className="lp-link" href={pageUrl(PATH_ROUTE)} onClick={followInApp(practice.onOpenPaths)}>All {paths.length} learning paths <ArrowRightIcon /></a>
          </p>
        </section>
      )}

      <Suspense fallback={null}><PopularLessons nodeByFile={nodeByFile || {}} onOpenFile={onOpenFile} /></Suspense>

      <section className="lp-sec" aria-labelledby="lp-areas">
        <h2 id="lp-areas">{LIBRARY.heading}</h2>
        <p className="lp-sec-sub">{LIBRARY.sub}</p>
        <ul className="lp-areas">
          {LIBRARY.items.map((p) => {
            const c = stats?.curricula?.[p.id];
            const target = c?.overview || c?.start;
            return (
              <li key={p.id}>
                {target
                  ? <a className="lp-area" {...link(target)}>
                    <span className="lp-area-t">{p.title}</span>
                    <span className="lp-area-b">{p.blurb}</span>
                    {c && <span className="lp-area-m">{LIBRARY.meta(p.id, c)}</span>}
                  </a>
                  : <div className="lp-area">
                    <span className="lp-area-t">{p.title}</span>
                    <span className="lp-area-b">{p.blurb}</span>
                  </div>}
              </li>
            );
          })}
        </ul>
        <p className="lp-more">
          <button type="button" className="lp-link lp-link-button" onClick={onDismiss}>{LIBRARY.treeLabel} <ArrowRightIcon /></button>
        </p>
      </section>

      {practice && <Suspense fallback={null}><PracticeStrip variant="landing" practice={practice} /></Suspense>}

      {newest.length > 0 && (
        <section className="lp-sec" aria-labelledby="lp-yt">
          <h2 id="lp-yt">{VIDEO.heading}</h2>
          <p className="lp-sec-sub">{VIDEO.sub(videoTotals.count, videoTotals.seconds)}</p>
          <ul className="lp-video-strip">
            {newest.map((v) => (
              <li key={v.id}><VideoCard video={v} node={v.file ? nodeByFile?.[v.file] : null} onOpenFile={onOpenFile} /></li>
            ))}
          </ul>
          <div className="lp-video-acts">
            <button type="button" className="lp-btn" onClick={onOpenVideos}>{VIDEO.all(videoTotals.count)} <ArrowRightIcon /></button>
            <a className="lp-btn" href={YOUTUBE.channel} target="_blank" rel="noopener noreferrer">
              <YoutubeIcon /> {VIDEO.label}
            </a>
          </div>
        </section>
      )}

      {/* The small print, quietly: an account is optional, and a mistake is welcome news. */}
      <section className="lp-end" aria-label="Your account and corrections">
        {!user && (
          <div className="lp-end-col">
            <h2 id="lp-acct">{ACCOUNT.heading}</h2>
            <p>{ACCOUNT.body}</p>
            <SignInButton onClick={onLogin} />
          </div>
        )}
        <div className="lp-end-col">
          <h2 id="lp-oss">{OPEN_SOURCE.heading}</h2>
          <p>{OPEN_SOURCE.body(modules)}</p>
          <p className="lp-end-links">
            <a className="lp-link" href={DEVELOPER_EMAIL_LINK}>{OPEN_SOURCE.primaryLabel}</a>
            <a className="lp-link" href={TRUST.corrections.url}>{TRUST.corrections.label}</a>
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
