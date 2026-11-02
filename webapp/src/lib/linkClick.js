// A link that works inside the app on an ordinary click and everywhere else as a link (open in a new tab, copy the
// address, search engines): it has a real href, and this decides whether the app should take the click.

/** A plain left click: not a request to open a new tab or window, nor to download. */
export const isPlainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** For an onClick: when the click is plain, stop the browser following the href and run `go` instead. */
export function followInApp(go) {
  return (event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    go();
  };
}
