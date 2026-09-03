// Manual ../. relative-path resolver, ported verbatim. Content is fetch()ed
// as text with no real page navigation happening, so there's no natural
// browser base URL to resolve markdown-relative image/link paths against.
export function resolvePath(baseDir, rel) {
  const stack = baseDir ? baseDir.split('/') : [];
  rel.split('/').forEach((p) => {
    if (p === '' || p === '.') return;
    if (p === '..') stack.pop(); else stack.push(p);
  });
  return stack.join('/');
}

const ABSOLUTE_URL_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * Rewrites #content img[src] (relative -> resolved against the doc's
 * folder, lazy-loaded, missing-image placeholder on error) and a[href]
 * (external/mailto -> target=_blank; internal .md/dir links tagged with
 * data-internal-link/data-path/data-heading for ArticleView's delegated
 * click handler to intercept; everything else left as a resolved href).
 *
 * fileSet: Set<string> of known file paths (mirrors the vanilla fileRows
 * keys). dirIndex: {[dirPath]: readmeFilePath} (mirrors dirIndex).
 */
export function rewriteLinks(root, filePath, fileSet, dirIndex) {
  const baseDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';

  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    if (!ABSOLUTE_URL_RE.test(src) && !src.startsWith('data:') && !src.startsWith('/')) {
      img.setAttribute('src', resolvePath(baseDir, src));
    }
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      if (img.classList.contains('broken')) return;
      img.classList.add('broken');
      const note = document.createElement('div');
      note.className = 'img-missing';
      note.textContent = 'Image not found: ' + img.getAttribute('src');
      img.after(note);
    }, { once: true });
  });

  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || a.classList.contains('anchor')) return;
    if (ABSOLUTE_URL_RE.test(href) || href.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
      return;
    }
    if (href.startsWith('#')) return;

    const [raw, hash] = href.split('#');
    const resolved = resolvePath(baseDir, raw);
    const clean = resolved.replace(/\/$/, '');
    let target = null;
    if (resolved.toLowerCase().endsWith('.md') && fileSet.has(resolved)) target = resolved;
    else if (dirIndex[clean]) target = dirIndex[clean];

    if (target) {
      a.setAttribute('href', '#' + encodeURIComponent(target));
      a.dataset.internalLink = 'true';
      a.dataset.path = target;
      if (hash) a.dataset.heading = hash;
    } else {
      a.setAttribute('href', resolved + (hash ? '#' + hash : ''));
    }
  });
}
