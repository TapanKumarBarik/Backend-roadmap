import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/errors.js';
import { studyableFiles } from '../lib/curriculum/curriculumPosition.js';

// Ported from indexNodes()/main()'s docs-index.json fetch. Derives the same
// lookup structures the vanilla app built once at boot: nodeByFile (path ->
// node), flatFiles (every page, in order), learnFiles (just the modules you can
// study, in order: what progress, "continue" and learning paths are made of),
// dirIndex (dir path -> its README's file path, for breadcrumb/link resolution),
// fileSet (for O(1) internal-link resolution), and searchItems (palette search corpus).
function buildIndex(data) {
  const nodeByFile = {};
  const flatFiles = [];
  const dirIndex = {};
  const searchItems = [];

  function indexNodes(nodes) {
    nodes.forEach((n) => {
      if (n.file) {
        nodeByFile[n.file] = n;
        flatFiles.push(n.file);
        if (!n.name.endsWith('.md')) dirIndex[n.path] = n.file;
        const tags = n.tags || [];
        searchItems.push({
          file: n.file,
          title: n.title || n.name,
          path: n.path,
          tags,
          hay: ((n.title || n.name) + ' ' + n.path).toLowerCase(),
          tagStr: tags.join(' ').toLowerCase()
        });
      }
      if (n.children && n.children.length) indexNodes(n.children);
    });
  }
  indexNodes(data.tree);

  return {
    treeData: data.tree,
    tags: data.tags || {},
    nodeByFile,
    flatFiles,
    learnFiles: studyableFiles(flatFiles, nodeByFile),
    fileSet: new Set(flatFiles),
    dirIndex,
    searchItems
  };
}

// The whole app depends on this file. A failure is kept (as an ApiError, status and all) so MainColumn can say
// what happened and offer `reload`, instead of silently rendering "0 modules".
export function useDocsIndex() {
  const [state, setState] = useState({
    treeData: [],
    tags: {},
    loading: true,
    error: null,
    nodeByFile: {},
    flatFiles: [],
    learnFiles: [],
    fileSet: new Set(),
    dirIndex: {},
    searchItems: []
  });
  const alive = useRef(true);
  const newest = useRef(0);

  // Returns the promise so a "Try again" button can show it is working; a failed retry keeps the old error.
  const reload = useCallback(() => {
    const mine = ++newest.current;
    const current = () => alive.current && mine === newest.current;
    return fetch('/docs-index.json')
      .then((res) => {
        if (!res.ok) throw new ApiError('docs-index.json fetch failed: ' + res.status, { status: res.status, url: res.url });
        return res.json();
      })
      .then(buildIndex)
      .then(
        (built) => { if (current()) setState({ ...built, loading: false, error: null }); },
        (error) => { if (current()) setState((s) => ({ ...s, loading: false, error })); }
      );
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
  }, [reload]);

  return { ...state, reload };
}
