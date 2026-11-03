import { useState } from 'react';
import { useLoader } from './useLoader.js';
import { checkContentFile, saveContentFile } from '../lib/practiceApi.js';
import { readSiteFile } from '../lib/siteContentApi.js';
import { friendlyMessage } from '../lib/errors.js';

// One of the site files (content/paths.json, videos.json, seo.json) as an editor holds it: what is in the repository now (`file`:
// { value, sha }), and the three things an editor does with it, check, save and reload, each with what went wrong. The server checks
// again before it commits, whatever the screen did. `sha` is the file's version when it was read: if someone saved it since, GitHub
// refuses the commit (409) and `conflict` says so, and the editor offers a reload instead of overwriting their work.
//
//   const { file, error, check, save, reload, busy, problems, failure, conflict } = useSiteFile('videos.json', { playlists: [], videos: [] });
//
// `check(value)` and `save(value)` resolve true when they worked. `value` is the whole file, as the screen has it.
export function useSiteFile(path, empty) {
  const { data: file, setData: setFile, error, reload: load } = useLoader(() => readSiteFile(path, empty), [path]);
  const [busy, setBusy] = useState('');
  const [problems, setProblems] = useState([]);
  const [failure, setFailure] = useState('');
  const [conflict, setConflict] = useState(false);

  const forget = () => { setProblems([]); setFailure(''); setConflict(false); };

  async function run(what, work) {
    setBusy(what);
    forget();
    try {
      return await work();
    } catch (err) {
      if (err && err.status === 409) setConflict(true);
      else setFailure(friendlyMessage(err));
      if (err && err.problems) setProblems(err.problems);
      return false;
    } finally {
      setBusy('');
    }
  }

  const check = (value) => run('check', async () => {
    const found = await checkContentFile(path, JSON.stringify(value));
    setProblems(found);
    return found.length === 0;
  });

  const save = (value) => run('save', async () => {
    const saved = await saveContentFile({ path, content: JSON.stringify(value), sha: file.sha, create: !file.sha });
    setFile({ value, sha: saved.sha });
    return true;
  });

  const reload = () => { forget(); return load(); };

  return { file, error, check, save, reload, busy, problems, failure, conflict, forget };
}
