// A name for a downloaded file, made from a page's title: lower-case words joined by hyphens, with nothing a file system dislikes.

/** `Login flow (v2)!` with `svg` becomes `login-flow-v2.svg`; a title with no letters or digits gives `fallback`. */
export function fileNameFor(title, extension, { max, fallback }) {
  const words = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return `${words || fallback}.${extension}`;
}
