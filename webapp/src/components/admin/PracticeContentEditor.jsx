import { useState } from 'react';
import { fetchPracticeCatalog, readContentFile, checkContentFile, saveContentFile } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { friendlyMessage } from '../../lib/errors.js';
import { CONTENT_EDITOR } from '../../config/practice.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';

// Edits the quizzes, exercises and interview sets without a code editor: pick one (or start a new quiz), change it as
// JSON, check it, and save, which commits it to the repository like any other change to the content (so it is in the history, and the
// site is rebuilt). The server checks a file again before it commits it, so a mistake cannot stop the next deploy.
const pathOf = (kind, slug) => `practice/${kind}/${slug}.json`;

export default function PracticeContentEditor({ onToast }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const [path, setPath] = useState('');
  const [text, setText] = useState('');
  const [sha, setSha] = useState(null); // the file's version in the repository; null for a new file
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [slug, setSlug] = useState('');

  const files = catalog ? [
    ...catalog.quizzes.map((q) => ({ path: pathOf('quizzes', q.slug), label: `Quiz: ${q.title}` })),
    ...catalog.exercises.map((e) => ({ path: pathOf('exercises', e.slug), label: `Exercise: ${e.title}` })),
    ...catalog.interview.map((i) => ({ path: pathOf('interview', i.slug), label: `Interview: ${i.title}` })),
    ...catalog.coding.map((i) => ({ path: pathOf('interview', i.slug), label: `Coding: ${i.title}` }))
  ] : [];

  async function run(what, work) {
    setBusy(what);
    setError('');
    try { await work(); } catch (err) { setError(friendlyMessage(err)); if (err && err.problems) setProblems(err.problems); } finally { setBusy(''); }
  }

  const open = (chosen) => run('load', async () => {
    setProblems([]);
    if (!chosen) { setPath(''); setText(''); setSha(null); return; }
    const file = await readContentFile(chosen);
    setPath(chosen);
    setText(file.content);
    setSha(file.sha);
  });

  function startQuiz() {
    const clean = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(clean)) { setError(CONTENT_EDITOR.badSlug); return; }
    setError('');
    setProblems([]);
    setPath(pathOf('quizzes', clean));
    setText(`${JSON.stringify(CONTENT_EDITOR.quizTemplate, null, 2)}\n`);
    setSha(null);
  }

  const check = () => run('check', async () => {
    const found = await checkContentFile(path, text);
    setProblems(found);
    if (!found.length) onToast(CONTENT_EDITOR.good);
  });

  const save = () => run('save', async () => {
    const result = await saveContentFile({ path, content: text, sha, create: !sha });
    setSha(result.sha);
    setProblems([]);
    onToast(CONTENT_EDITOR.saved);
  });

  return (
    <>
      <div className="home-h">{CONTENT_EDITOR.heading}</div>
      <p className="pr-note">{CONTENT_EDITOR.lead}</p>
      <div className="pr-content-editor">
        <label className="pr-field">
          <span className="pr-field__label">{CONTENT_EDITOR.pick}</span>
          <select className="ui-field__control" value={files.some((f) => f.path === path) ? path : ''} onChange={(e) => open(e.target.value)}>
            <option value="">{CONTENT_EDITOR.none}</option>
            {files.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}
          </select>
        </label>
        <div className="pr-content-editor__new">
          <label className="pr-field">
            <span className="pr-field__label">{CONTENT_EDITOR.newQuiz}</span>
            <input className="ui-field__control" value={slug} placeholder="quiz-address-name" maxLength={60} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <Button variant="secondary" onClick={startQuiz} disabled={!slug.trim()}>{CONTENT_EDITOR.start}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
        {path && (
          <>
            <p className="pr-note"><code>content/{path}</code>{!sha && ` (${CONTENT_EDITOR.isNew})`}</p>
            <label className="pr-field">
              <span className="pr-field__label">{CONTENT_EDITOR.json}</span>
              <textarea className="pr-mono" rows={24} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setProblems([]); }} />
            </label>
            {problems.length > 0 && (
              <ul className="pr-problems" role="alert">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            <div className="pr-actions">
              <Button variant="secondary" loading={busy === 'check'} disabled={!!busy} onClick={check}>{CONTENT_EDITOR.check}</Button>
              <Button variant="primary" loading={busy === 'save'} disabled={!!busy || !text.trim()} onClick={save}>{CONTENT_EDITOR.save}</Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
