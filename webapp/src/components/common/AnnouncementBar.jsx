import { useEffect, useState } from 'react';
import { fetchAnnouncements } from '../../lib/practiceApi.js';
import { readJson, writeJson } from '../../lib/storage.js';
import { STORAGE } from '../../config/index.js';

// A notice from the site's admins, above every page, for as long as it is current. A visitor can dismiss one (remembered in this
// browser by its id, so it stays gone, and a new notice shows). Where notices cannot be loaded the bar is simply not there: a
// notice is never worth an error message.
export default function AnnouncementBar() {
  const [notices, setNotices] = useState([]);
  const [dismissed, setDismissed] = useState(() => readJson(STORAGE.dismissedNotices, []));

  useEffect(() => {
    let alive = true;
    const whenIdle = window.requestIdleCallback || ((run) => setTimeout(run, 1500));
    const handle = whenIdle(() => fetchAnnouncements().then((list) => { if (alive && Array.isArray(list)) setNotices(list); }).catch(() => {}));
    return () => { alive = false; (window.cancelIdleCallback || clearTimeout)(handle); };
  }, []);

  const shown = notices.find((n) => !dismissed.includes(n.id));
  if (!shown) return null;

  function dismiss() {
    const next = [...dismissed, shown.id].slice(-50);
    setDismissed(next);
    writeJson(STORAGE.dismissedNotices, next);
  }

  return (
    <div className="notice-bar" role="status">
      <p><strong>{shown.title}</strong>{shown.body ? <span> {shown.body}</span> : null}</p>
      <button type="button" className="notice-bar__close" onClick={dismiss} aria-label="Dismiss this notice">×</button>
    </div>
  );
}
