import { ArrowRightIcon, GithubIcon, SearchIcon } from '../common/icons.jsx';
import SignInButton from '../account/SignInButton.jsx';
import SiteFooter from '../common/SiteFooter.jsx';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { REPO_URL, CONTRIBUTE_URL } from '../../lib/curriculum/contribute.js';
import { SITE } from '../../config/index.js';
import { FALLBACK_START_FILE, HERO, ROUTE, PICK, LIBRARY, FRESH, INSIDE, ACCOUNT, OPEN_SOURCE } from '../../config/landing.js';
import '../../styles/landing.css';

// The front door, shown to someone who has not started yet (see hooks/useLanding.js). This component only
// lays things out: the words are in config/landing.js and the numbers come from build-time stats. If the
// stats are missing the page still reads correctly, it just says less.
export default function Landing({ stats, user, onLogin, onOpenFile, onStartPath, onDismiss, onOpenPalette }) {
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
  const heroPath = paths.find((p) => p.id === HERO.startPath);

  // Newest work in the featured curriculum: the last finished tracks, then any track part-way through.
  const featured = stats?.tracks?.[FRESH.curriculum] || [];
  const finished = featured.filter((t) => t.modules && t.written === t.modules).slice(-FRESH.finishedShown);
  const inProgress = featured.filter((t) => t.written > 0 && t.written < t.modules);
  const fresh = [...finished, ...inProgress];

  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-h1">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">{HERO.eyebrow}</p>
          <h1 id="lp-h1">{HERO.headline}</h1>
          <p className="lp-lead">{HERO.lead(modules)}</p>
          <div className="lp-cta">
            {heroPath
              ? <a className="lp-btn lp-btn-primary" {...startLink(heroPath)}>{HERO.startLabel(heroPath.title)} <ArrowRightIcon /></a>
              : <a className="lp-btn lp-btn-primary" {...link(startFile)}>{HERO.fallbackStartLabel} <ArrowRightIcon /></a>}
            <button type="button" className="lp-btn" onClick={onDismiss}>{HERO.browseLabel}</button>
          </div>
          <button type="button" className="lp-search" onClick={onOpenPalette}>
            <SearchIcon />
            <span>{HERO.searchLabel(modules)}</span>
          </button>
        </div>

        <figure className="lp-route">
          <figcaption>{HERO.routeCaption}</figcaption>
          <ol>
            {ROUTE.map((s) => (
              <li key={s.file}>
                <a {...link(s.file)}>
                  <span className="lp-stop" aria-hidden="true" />
                  <span className="lp-stop-t">{s.label}</span>
                  <span className="lp-stop-s">{s.sub}</span>
                </a>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      {paths.length > 0 && (
        <section className="lp-sec" aria-labelledby="lp-pick">
          <h2 id="lp-pick">{PICK.heading}</h2>
          <p className="lp-sec-sub">{PICK.sub}</p>
          <div className="lp-paths">
            {paths.map((p) => (
              <article key={p.id} className="lp-card">
                <div className="lp-topic">{p.topic}</div>
                <h3>{p.title}</h3>
                <p>{p.goal}</p>
                <div className="lp-meta">{PICK.meta(p)}</div>
                <div className="lp-card-acts">
                  <a className="lp-link lp-link-strong" {...startLink(p)}>{PICK.startLabel} <ArrowRightIcon /></a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="lp-sec" aria-labelledby="lp-paths">
        <h2 id="lp-paths">{LIBRARY.heading}</h2>
        <p className="lp-sec-sub">{LIBRARY.sub}</p>
        <div className="lp-paths">
          {LIBRARY.items.map((p) => {
            const c = stats?.curricula?.[p.id];
            return (
              <article key={p.id} className="lp-card">
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
                {c && <div className="lp-meta">{LIBRARY.meta(p.id, c, LIBRARY.unitFor(p.id))}</div>}
                <div className="lp-card-acts">
                  {c?.start && <a className="lp-link lp-link-strong" {...link(c.start)}>{LIBRARY.startLabel} <ArrowRightIcon /></a>}
                  {c?.overview && <a className="lp-link" {...link(c.overview)}>{LIBRARY.tracksLabel}</a>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {fresh.length > 0 && (
        <section className="lp-sec" aria-labelledby="lp-new">
          <h2 id="lp-new">{FRESH.heading}</h2>
          <p className="lp-sec-sub">{FRESH.sub}</p>
          <div className="lp-fresh">
            {fresh.map((t) => (
              <a key={t.id} className="lp-fresh-item" {...link(t.file)}>
                <span className="lp-fresh-t">{t.title}</span>
                <span className="lp-fresh-m">{FRESH.meta(t)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="lp-sec" aria-labelledby="lp-inside">
        <h2 id="lp-inside">{INSIDE.heading}</h2>
        <p className="lp-sec-sub">{INSIDE.sub}</p>
        <ul className="lp-inside">
          {INSIDE.items.map(([t, d]) => (
            <li key={t}><strong>{t}</strong><span>{d}</span></li>
          ))}
        </ul>
      </section>

      {!user && (
        <section className="lp-account" aria-labelledby="lp-acct">
          <div>
            <h2 id="lp-acct">{ACCOUNT.heading}</h2>
            <p>{ACCOUNT.body}</p>
            <p className="lp-account-note">{ACCOUNT.note}</p>
          </div>
          <div className="lp-account-act">
            <SignInButton onClick={onLogin} />
          </div>
        </section>
      )}

      <section className="lp-open" aria-labelledby="lp-oss">
        <div>
          <h2 id="lp-oss">{OPEN_SOURCE.heading}</h2>
          <p>{OPEN_SOURCE.body(modules, SITE.license)}</p>
        </div>
        <div className="lp-open-acts">
          <a className="lp-btn lp-btn-invert" href={CONTRIBUTE_URL} target="_blank" rel="noopener noreferrer">{OPEN_SOURCE.primaryLabel}</a>
          <a className="lp-btn lp-btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <GithubIcon /> {OPEN_SOURCE.secondaryLabel}
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
