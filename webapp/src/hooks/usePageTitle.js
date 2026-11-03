import { useEffect } from 'react';
import { SITE } from '../config/index.js';
import { LISTING_COPY } from '../config/paths.js';

// Sets the browser tab's title for a screen that has an address of its own, in the form its pre-rendered page has ("Name · Site").
// Nothing happens while the title is not known yet (the screen is still loading), so the page keeps the title it was served with.
export function usePageTitle(title) {
  useEffect(() => { if (title) document.title = LISTING_COPY.title(title, SITE.name); }, [title]);
}
