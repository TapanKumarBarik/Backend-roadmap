export function subtreeStats(node, statusMap) {
  let done = 0, wip = 0, total = 0;
  (function walk(n) {
    if (n.file) {
      total++;
      const s = statusMap[n.file] || 'todo';
      if (s === 'done') done++;
      else if (s === 'wip') wip++;
    }
    (n.children || []).forEach(walk);
  })(node);
  return { done, wip, total };
}

export function globalCounts(flatFiles, statusMap) {
  let done = 0, wip = 0;
  const total = flatFiles.length;
  flatFiles.forEach((f) => {
    const s = statusMap[f] || 'todo';
    if (s === 'done') done++;
    else if (s === 'wip') wip++;
  });
  return { done, wip, todo: total - done - wip, total };
}
