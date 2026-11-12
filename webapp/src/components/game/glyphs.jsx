// The icons of the learning game and of the practice screens: drawn here, in the site's line style (24-unit grid, round caps and joins), so a path, a
// track or a badge is recognisable at a glance and nothing is borrowed from a brand. `glyphFor` (lib/game/glyphs.js) chooses one for a title.
const DRAW = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" /></>,
  plug: <><path d="M9 3v4M15 3v4" /><path d="M6.5 7h11v3.2a5.5 5.5 0 0 1-11 0V7Z" /><path d="M12 15.7V21" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><circle cx="12" cy="16" r="1.2" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.4 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  database: <><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" /><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />,
  queue: <><path d="M4 6h12M4 12h16M4 18h9" /><path d="m17.5 15 3 3-3 3" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  network: <><circle cx="12" cy="5.5" r="2.3" /><circle cx="5.5" cy="18" r="2.3" /><circle cx="18.5" cy="18" r="2.3" /><path d="m10.8 7.6-4.1 8.3M13.2 7.6l4.1 8.3M7.8 18h8.4" /></>,
  cube: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  helm: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.2" /><path d="M12 3v6.8M12 14.2V21M4.2 7.5l5.9 3.4M13.9 13.1l5.9 3.4M4.2 16.5l5.9-3.4M13.9 10.9l5.9-3.4" /></>,
  terminal: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 10 3 2.5L7 15M12.5 15H17" /></>,
  branch: <><circle cx="6.5" cy="5.5" r="2.2" /><circle cx="6.5" cy="18.5" r="2.2" /><circle cx="17.5" cy="8.5" r="2.2" /><path d="M6.5 7.7v8.6" /><path d="M6.5 14.5C6.5 11 17.5 13 17.5 10.7" /></>,
  pipeline: <><rect x="2.5" y="8.5" width="5" height="7" rx="1.3" /><rect x="9.5" y="8.5" width="5" height="7" rx="1.3" /><rect x="16.5" y="8.5" width="5" height="7" rx="1.3" /><path d="M7.5 12h2M14.5 12h2" /></>,
  cloud: <path d="M7.5 18.5a4.2 4.2 0 0 1-.8-8.3A5.7 5.7 0 0 1 17.8 9.2a4.7 4.7 0 0 1-.3 9.3H7.5Z" />,
  chip: <><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx=".8" /><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" /></>,
  spark: <><path d="M10.5 3.5 12.4 9l5.5 1.9-5.5 1.9-1.9 5.5-1.9-5.5L3.1 10.9 8.6 9l1.9-5.5Z" /><path d="m18.2 15.6.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></>,
  vector: <><circle cx="6" cy="18" r="2" /><path d="M7.4 16.6 17 7" /><path d="M11.5 6.5h6v6" /><circle cx="18" cy="18" r="1.3" /><circle cx="6" cy="6" r="1.3" /></>,
  layers: <><path d="m12 3.5 9 4.7-9 4.7-9-4.7 9-4.7Z" /><path d="m3 12.2 9 4.7 9-4.7" /><path d="m3 16.7 9 4.7 9-4.7" /></>,
  blocks: <><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" /><path d="M16.75 13v7.5M13 16.75h7.5" /></>,
  chart: <><path d="M3.5 3.5v17h17" /><path d="m7.5 15 3.5-4.5 3 3 5-6.5" /></>,
  nodes: <><circle cx="5" cy="6" r="1.8" /><circle cx="5" cy="12" r="1.8" /><circle cx="5" cy="18" r="1.8" /><circle cx="12" cy="9" r="1.8" /><circle cx="12" cy="15" r="1.8" /><circle cx="19" cy="12" r="1.8" /><path d="M6.7 6.5l3.6 2M6.7 11.5l3.6-2M6.7 12.5l3.6 2M6.7 17.5l3.6-2M6.7 6.8l3.6 7.4M6.7 17.2l3.6-7.4M13.7 9.5l3.6 2M13.7 14.5l3.6-2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  rocket: <><path d="M12 2.8c3.4 2.3 5 5.6 5 9.2v3.2l-2 2.3H9l-2-2.3V12c0-3.6 1.6-6.9 5-9.2Z" /><circle cx="12" cy="10" r="1.6" /><path d="M7 14.5 4.5 17v3l3-1.5M17 14.5l2.5 2.5v3l-3-1.5M12 17.5V21" /></>,
  trophy: <><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" /><path d="M7.5 6h-3v1.5a3 3 0 0 0 3 3M16.5 6h3v1.5a3 3 0 0 1-3 3" /><path d="M12 13.5V17M8.5 20.5h7M10 17h4v3.5" /></>,
  crown: <path d="m3.5 8 4.2 4 4.3-6.5 4.3 6.5 4.2-4-1.5 10h-14L3.5 8Z" />,
  snow: <><path d="M12 3v18M9.6 5.4 12 7.8l2.4-2.4M9.6 18.6 12 16.2l2.4 2.4" /><path d="M12 3v18M9.6 5.4 12 7.8l2.4-2.4M9.6 18.6 12 16.2l2.4 2.4" transform="rotate(60 12 12)" /><path d="M12 3v18M9.6 5.4 12 7.8l2.4-2.4M9.6 18.6 12 16.2l2.4 2.4" transform="rotate(120 12 12)" /></>,
  flame: <><path d="M12 2.8c.7 3 4.8 4.8 4.8 9.4a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.1 1.9-4 .3 1.1 1 1.8 1.9 2.1C10.7 7.5 11 5 12 2.8Z" /><path d="M12 14.6c.9.6 1.4 1.4 1.4 2.3a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.7 1.4-2.3Z" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.2 9" /></>,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5V5.5Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5V5.5Z" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />,
  gauge: <><path d="M4 17a8 8 0 1 1 16 0" /><path d="m12 17 4-5.5" /><circle cx="12" cy="17" r="1.1" /><path d="M5 17h2M17 17h2" /></>,
  server: <><rect x="3.5" y="4" width="17" height="6.5" rx="2" /><rect x="3.5" y="13.5" width="17" height="6.5" rx="2" /><path d="M7 7.25h.01M7 16.75h.01M11 7.25h6M11 16.75h6" /></>,
  key: <><circle cx="8" cy="15.5" r="4" /><path d="m11 12.6 8.5-8.6M16 7.5l2.5 2.5M13.5 10l2 2" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  flask: <><path d="M9 3.5h6M10 3.5v6L4.8 18.8a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.5v-6" /><path d="M7.5 15h9" /></>,
  map: <><path d="m9 4.5-6 2v13l6-2 6 2 6-2v-13l-6 2-6-2Z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  sigma: <path d="M18 4.5H6.5l6 7.5-6 7.5H18" />,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9.5" r="2.5" /><path d="M17 14.6c2.4 0 4.5 1.6 4.5 4.4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  repeat: <><path d="M20 11a8 8 0 0 0-14.2-4.5M4 4v3.5h3.5" /><path d="M4 13a8 8 0 0 0 14.2 4.5M20 20v-3.5h-3.5" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11.5l-2.2 4 2.2 4H5.5" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  bug: <><path d="M9 9.5a3 3 0 0 1 6 0V15a3 3 0 0 1-6 0V9.5Z" /><path d="M12 9v9M9 11.5H4.5M15 11.5h4.5M9 15.5l-3.5 2M15 15.5l3.5 2M9.5 7 7.5 4.5M14.5 7l2-2.5" /></>,
  pencil: <><path d="M4 20l1-4.2L16.6 4.2a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.2 19 4 20Z" /><path d="m14.5 6.3 3.2 3.2" /></>,
  list: <path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
};

/** The names a glyph can have, for the design page and for checking that a config rule names a real one. */
export const GLYPH_NAMES = Object.keys(DRAW);

/** The drawing of a glyph, to put inside an <svg> with a 24-unit viewBox. Unknown names draw the book. */
export function GlyphPaths({ name }) {
  return DRAW[name] || DRAW.book;
}

/** A glyph as an icon: sized by its CSS (width and height), coloured by `currentColor`, hidden from screen readers unless it has a `title`. */
export function Glyph({ name, title, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" {...rest}>
      <GlyphPaths name={name} />
    </svg>
  );
}
