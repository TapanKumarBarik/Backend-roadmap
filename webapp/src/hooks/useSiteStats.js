import { useEffect, useState } from 'react';

// Build-time numbers for the landing page (scripts/gen-site-stats.mjs writes dist/site-stats.json).
// Fetched once per page load and shared. Failure is not an error: the landing page is written to read
// correctly without any numbers, so a missing file just means it says less.
let pending = null;

function load() {
  if (!pending) {
    pending = fetch('/site-stats.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return pending;
}

export function useSiteStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    load().then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, []);
  return stats;
}
