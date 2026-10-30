import { SITE, DEVELOPER, DEVELOPER_EMAIL_LINK, REPO_URL } from '../../config/index.js';
import BrandMark from './BrandMark.jsx';
import { BUILD_TIME } from '../../lib/buildInfo.js';

// Shared by the landing page and the dashboard. BUILD_TIME is the moment of the last deploy, which is when
// the content last changed (every deploy is a fresh build of the repository).
const DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric' };
const external = { target: '_blank', rel: 'noopener noreferrer' };

export default function SiteFooter() {
  const updated = BUILD_TIME ? new Date(BUILD_TIME) : null;
  return (
    <footer className="site-footer">
      <p className="sf-row sf-brand">
        <BrandMark size={22} />
        <strong>{SITE.name}</strong>
        <span>Free and open source</span>
      </p>
      <p className="sf-row">
        <a href="/privacy.html">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms.html">Terms</a>
        <span aria-hidden="true">·</span>
        <a href={REPO_URL} {...external}>GitHub</a>
        <span aria-hidden="true">·</span>
        <span>{SITE.license} licensed</span>
        {updated && (
          <>
            <span aria-hidden="true">·</span>
            <span>Last updated <time dateTime={updated.toISOString()}>{updated.toLocaleDateString(undefined, DATE_FORMAT)}</time></span>
          </>
        )}
      </p>
      <p className="sf-row sf-dev">
        <span>Built and maintained by <strong>{DEVELOPER.name}</strong></span>
        <span aria-hidden="true">·</span>
        <a href={DEVELOPER_EMAIL_LINK}>{DEVELOPER.email}</a>
        <span aria-hidden="true">·</span>
        <a href={DEVELOPER.linkedin} {...external}>LinkedIn</a>
      </p>
    </footer>
  );
}
