import { useEffect, useState } from 'react';

// Ported from indexNodes()/main()'s docs-index.json fetch. Derives the same
// lookup structures the vanilla app built once at boot: nodeByFile (path ->
// node), flatFiles (ordered, for prev/next + J/K), dirIndex (dir path ->
// its README's file path, for breadcrumb/link resolution), fileSet (for
// O(1) internal-link resolution), and searchItems (palette search corpus).
export function useDocsIndex() {
  const [state, setState] = useState({
    treeData: [],
    tags: {},
    loading: true,
    error: null,
    nodeByFile: {},
    flatFiles: [],
    fileSet: new Set(),
    dirIndex: {},
    searchItems: []
  });

  useEffect(() => {
    let cancelled = false;
    fetch('docs-index.json')
      .then((res) => {
        if (!res.ok) throw new Error('docs-index.json fetch failed: ' + res.status);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
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

        setState({
          treeData: data.tree,
          tags: data.tags || {},
          loading: false,
          error: null,
          nodeByFile,
          flatFiles,
          fileSet: new Set(flatFiles),
          dirIndex,
          searchItems
        });
      })
      .catch((error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error }));
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
