// When each file was first written and last changed, from git history: { 'backend/01-x/README.md': { created, modified } },
// as YYYY-MM-DD, keyed by the path the file has today (a rename carries its history along, and a pure rename is
// not a change). Search engines use these dates to decide what is worth fetching again, and they are only worth
// anything if they are true, so when there is no full history to read (a shallow clone, no git) this returns null
// and callers leave the dates out instead of guessing.
import { execFileSync } from 'node:child_process';

export function gitDates(root) {
  const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  let log;
  try {
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') return null;
    log = git('log', '-M', '--name-status', '--format=@%aI');
  } catch {
    return null;
  }

  const dates = {};
  const today = new Map(); // a path as it was at the point of history being read -> the path it has today
  const touch = (file, day) => {
    const entry = dates[file] || (dates[file] = { created: day, modified: day });
    entry.created = day; // newest first, so the last one seen is the first one written
  };

  let day = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) { day = line.slice(1, 11); continue; }
    if (!line || !day) continue;
    const [status, from, to] = line.split('\t');
    if (status[0] === 'R') {
      const current = today.get(to) || to;
      today.set(from, current);
      if (status !== 'R100') touch(current, day);
    } else if (status === 'A' || status === 'M') {
      touch(today.get(from) || from, day);
    }
  }
  return dates;
}
