import { MAIN_NAV } from '../../config/nav.js';
import { followInApp } from '../../lib/linkClick.js';

// The six main places, as links in the top bar (they have real addresses, so a new tab and copying a link work). `items` are
// { key, label, href, go, badge }: `key` is what the page reports as where you are (App.jsx activeDest), `go` opens it in the app.
export default function MainNav({ items, activeDest }) {
  return (
    <nav id="mainNav" aria-label={MAIN_NAV.label}>
      {items.map((item) => {
        const on = item.key === activeDest;
        return (
          <a
            key={item.label}
            className={'mainnav-link' + (on ? ' on' : '')}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            onClick={followInApp(item.go)}
          >
            {item.label}
            {item.badge && <><span className="activity-dot" aria-hidden="true" /><span className="sr-only"> — {MAIN_NAV.newActivity}</span></>}
          </a>
        );
      })}
    </nav>
  );
}
