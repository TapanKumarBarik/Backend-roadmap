import { useEffect, useState } from 'react';

// Lets a component ask where it should render, rather than duplicating
// itself and hiding one copy with CSS. Notes live in the right rail, but
// that rail is display:none below 1180px — without this the notes box
// would simply cease to exist on a laptop or a phone.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => (typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false)
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
