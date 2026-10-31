import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitDates } from './gitDates.mjs';

// A throwaway repository whose commits carry the dates given, so the test can say what the answer must be.
function repository() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dates-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  const commit = (day, message, change) => {
    change(dir);
    git('add', '-A');
    const when = `${day}T12:00:00+00:00`;
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], {
      cwd: dir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }
    });
  };
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  return { dir, git, commit, write };
}

test('a file is dated from its first commit to its last real change', () => {
  const { dir, commit, write } = repository();
  commit('2026-01-10', 'write', () => write('backend/x/README.md', '# X\n\none two three four five six seven eight nine ten\n'));
  commit('2026-02-20', 'edit', () => write('backend/x/README.md', '# X\n\none two three four five six seven eight nine ten eleven\n'));
  assert.deepEqual(gitDates(dir)['backend/x/README.md'], { created: '2026-01-10', modified: '2026-02-20' });
});

test('moving the curricula into a content folder changes no date, and the dates are keyed from inside it', () => {
  const { dir, commit, write, git } = repository();
  commit('2026-01-10', 'write', () => write('backend/x/README.md', '# X\n\nthe same text in every commit of this test, long enough to be recognised as a rename\n'));
  commit('2026-02-20', 'edit', () => write('backend/y/README.md', '# Y\n\nanother lesson with enough text in it to be recognised as the same file after a move\n'));
  commit('2026-03-30', 'move', () => {
    fs.mkdirSync(path.join(dir, 'content'));
    git('mv', 'backend', 'content/backend');
  });

  const dates = gitDates(dir, 'content');
  assert.deepEqual(dates['backend/x/README.md'], { created: '2026-01-10', modified: '2026-01-10' });
  assert.deepEqual(dates['backend/y/README.md'], { created: '2026-02-20', modified: '2026-02-20' });
  assert.ok(!Object.keys(dates).some((file) => file.startsWith('content/')), 'keys do not carry the content folder');
});

test('files outside the content folder are left out when a content folder is named', () => {
  const { dir, commit, write } = repository();
  commit('2026-01-10', 'write', () => {
    write('content/backend/x/README.md', '# X\n');
    write('README.md', '# Project\n');
  });
  assert.deepEqual(Object.keys(gitDates(dir, 'content')), ['backend/x/README.md']);
});

test('with no repository there are no dates, rather than guessed ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dates-none-'));
  assert.equal(gitDates(dir), null);
});
