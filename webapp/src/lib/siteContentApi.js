// What the admin's Site screens (components/admin/SiteAdmin.jsx) read besides the three files themselves. The files go through the same
// calls as the practice content (readContentFile, checkContentFile, saveContentFile in practiceApi.js); this adds the deployed
// site's own lists, which the editors pick from and the server checks against, and reading a file that may not exist yet.

import { readContentFile } from './practiceApi.js';
import { apiError } from './errors.js';
import { listFolders, listPages } from './siteContent/modules.js';

/** Every module and folder of the site as deployed: { tree, pages, folders, curricula }. Read once per visit, and again after a failure. */
let index = null;
export const fetchModuleIndex = () => {
  if (!index) {
    index = fetch('/docs-index.json')
      .then(async (res) => {
        if (!res.ok) throw await apiError(res, 'failed to load the module list');
        const data = await res.json();
        return { tree: data.tree, pages: listPages(data.tree), folders: listFolders(data.tree), curricula: data.tree.map((node) => node.name) };
      })
      .catch((err) => { index = null; throw err; });
  }
  return index;
};

/** The description each module's page has without an override, { "<README.md>": "…" } (written by the build), or false when there is none (a local site that was never built). */
export async function fetchGeneratedDescriptions() {
  const res = await fetch('/seo-defaults.json');
  if (!res.ok || !String(res.headers.get('content-type') || '').includes('json')) return false;
  return res.json();
}

/**
 * A site file as it is in the repository: { value, sha }. A file that is not there yet (seo.json is optional) comes back as `empty`
 * with no sha, so saving creates it.
 * @param {string} path
 * @param {any} empty
 */
export async function readSiteFile(path, empty) {
  try {
    const file = await readContentFile(path);
    return { value: JSON.parse(file.content), sha: file.sha };
  } catch (err) {
    if (err && err.status === 404) return { value: empty, sha: null };
    throw err;
  }
}
