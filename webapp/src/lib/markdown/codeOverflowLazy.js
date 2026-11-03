// Starts watching the code blocks of a page (lib/markdown/codeOverflow.js) without that code being in the first download: it is fetched once
// there is a code block to watch. Returns the function that stops watching, which is safe to call before the code has arrived.
export function watchCodeOverflow(root) {
  if (!root.querySelector('.codeblock > pre')) return () => {};
  let stop = null;
  let cancelled = false;
  import('./codeOverflow.js').then((module) => { if (!cancelled) stop = module.watchCodeOverflow(root); }, () => { /* the blocks simply scroll, as they always did */ });
  return () => { cancelled = true; if (stop) stop(); };
}
