// Plain LCS-based line diff — O(n*m) time and space, no dependency. Fine at
// the scale this is actually used at (one markdown file in the admin
// content editor, realistically a few hundred lines); not meant for
// anything larger.
export function lineDiff(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { result.push({ type: 'removed', text: a[i] }); i++; }
    else { result.push({ type: 'added', text: b[j] }); j++; }
  }
  while (i < n) { result.push({ type: 'removed', text: a[i] }); i++; }
  while (j < m) { result.push({ type: 'added', text: b[j] }); j++; }
  return result;
}
