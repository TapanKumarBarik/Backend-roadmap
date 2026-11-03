import { useMemo, useState } from 'react';
import { useLoader } from '../../hooks/useLoader.js';
import { useSiteFile } from '../../hooks/useSiteFile.js';
import { fetchGeneratedDescriptions, fetchModuleIndex } from '../../lib/siteContentApi.js';
import { SITE_FILES } from '../../lib/siteContent/index.js';
import { serializeSeo } from '../../lib/siteContent/seo.js';
import { buildPageTitles } from '../../lib/curriculum/pageTitle.js';
import { moduleUrl } from '../../lib/curriculum/moduleUrl.js';
import { SITE } from '../../config/index.js';
import { SAVE_BAR, SEO_EDITOR, SEO_LIMITS, SITE_ADMIN } from '../../config/siteAdmin.js';
import { Button } from '../ui/Button.jsx';
import { Chip } from '../ui/Chip.jsx';
import { TextField } from '../ui/Field.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import SaveBar from './SaveBar.jsx';

const COPY = SEO_EDITOR;

// What is committed: each text trimmed, an empty one left out, a page with nothing left dropped.
function tidy(seo) {
  const clean = {};
  for (const [file, entry] of Object.entries(seo)) {
    const fields = {};
    for (const key of ['title', 'description']) {
      const text = String(entry[key] ?? '').trim();
      if (text) fields[key] = text;
    }
    if (Object.keys(fields).length) clean[file] = fields;
  }
  return clean;
}

// The titles and descriptions search engines show for a module (content/seo.json): pick a module, see what the site generates for it,
// write your own and see it as a search result. Nothing here is applied until it is saved and the site is rebuilt.
export default function SeoEditor({ onToast }) {
  const site = useSiteFile(SITE_FILES.seo, {});
  const { data: modules, error: modulesError, reload: reloadModules } = useLoader(fetchModuleIndex);
  // The generated descriptions come from the build; without one (a local site that was never built) the screen says they are not known.
  // `descriptions` is null while they load, and false when there are none.
  const { data: descriptions } = useLoader(() => fetchGeneratedDescriptions().catch(() => false));
  const confirm = useConfirm();
  const [edits, setEdits] = useState(null);
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('');
  const titles = useMemo(() => (modules ? buildPageTitles(modules.tree, SITE.name) : {}), [modules]);

  if (site.error) return <LoadError error={site.error} what={SITE_ADMIN.loading.seo} onRetry={site.reload} />;
  if (modulesError) return <LoadError error={modulesError} what={SITE_ADMIN.loading.modules} onRetry={reloadModules} />;
  if (!site.file || !modules) return <Skeleton lines={6} />;

  const draft = edits || site.file.value;
  const clean = tidy(draft);
  const dirty = edits !== null && serializeSeo(clean) !== serializeSeo(site.file.value);
  const pageOf = (key) => modules.pages.find((p) => p.file === key);
  const page = pageOf(file);
  const own = draft[file] || {};
  const generatedTitle = titles[file] ? titles[file].full : '';
  const generatedDescription = descriptions ? descriptions[file] : '';

  const needle = query.trim().toLowerCase();
  const found = needle ? modules.pages.filter((p) => `${p.title} ${p.folder}`.toLowerCase().includes(needle)).slice(0, SITE_ADMIN.moduleMatches) : [];

  const write = (changes) => setEdits({ ...draft, [file]: { ...own, ...changes } });
  const without = (key) => { const next = { ...draft }; delete next[key]; setEdits(next); };
  async function removeOverride(key) {
    const label = pageOf(key)?.title || key;
    if (await confirm({ title: COPY.removeTitle(label), body: COPY.removeBody, confirmLabel: COPY.removeConfirm, tone: 'danger' })) without(key);
  }

  const check = async () => { if (await site.check(clean)) onToast(SAVE_BAR.good); };
  async function save() {
    if (await site.save(clean)) { setEdits(null); onToast(SAVE_BAR.saved); }
  }
  const discard = () => { setEdits(null); site.forget(); };
  const reload = () => { setEdits(null); return site.reload(); };

  const shownTitle = (own.title || '').trim() || generatedTitle;
  const shownDescription = (own.description || '').trim() || generatedDescription || '';
  const titleLength = (own.title || '').trim().length;
  const descriptionLength = (own.description || '').trim().length;
  const overridden = Object.entries(clean);

  return (
    <>
      <div className="home-h">{COPY.heading}</div>
      <p className="pr-note">{COPY.lead}</p>

      <TextField label={COPY.find} hint={COPY.findHint} value={query} onChange={(e) => setQuery(e.target.value)} />
      {needle && found.length === 0 && <p className="pr-note">{COPY.findNone}</p>}
      {found.length > 0 && (
        <ul className="sa-found" aria-label={COPY.results}>
          {found.map((p) => (
            <li key={p.file}>
              <button type="button" className={'sa-pick' + (p.file === file ? ' is-current' : '')} aria-label={COPY.pick(p.title)} aria-current={p.file === file ? 'true' : undefined} onClick={() => setFile(p.file)}>
                <strong>{p.title}</strong>
                <span>{p.folder}{p.planned ? ` (${COPY.planned})` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {page && (
        <section className="sa-seo" aria-label={`${COPY.editing} ${page.title}`}>
          <h3 className="sa-seo__page">{COPY.editing}: {page.title} <code>{page.folder}</code></h3>
          <dl className="sa-generated">
            <dt>{COPY.generatedTitle}</dt>
            <dd>{generatedTitle}</dd>
            <dt>{COPY.generatedDescription}</dt>
            <dd>{generatedDescription || (descriptions === null ? '' : COPY.descriptionUnknown)}</dd>
          </dl>

          <TextField label={COPY.titleField} hint={COPY.titleHint} value={own.title ?? ''} onChange={(e) => write({ title: e.target.value })} />
          <p className={'sa-count' + (titleLength > SEO_LIMITS.titleMax ? ' is-over' : '')} aria-live="polite">{COPY.titleCount(titleLength)}</p>
          <TextField label={COPY.descriptionField} hint={COPY.descriptionHint} multiline rows={3} value={own.description ?? ''} onChange={(e) => write({ description: e.target.value })} />
          <p className={'sa-count' + (descriptionLength > 0 && (descriptionLength < SEO_LIMITS.descriptionMin || descriptionLength > SEO_LIMITS.descriptionMax) ? ' is-over' : '')} aria-live="polite">{COPY.descriptionCount(descriptionLength)}</p>

          <div className="sa-serp" role="group" aria-label={COPY.previewLabel}>
            <div className="sa-serp__head">{COPY.previewHeading}</div>
            <div className="sa-serp__url">{SITE.url}{moduleUrl(page.file)}</div>
            <div className="sa-serp__title">{shownTitle}</div>
            <div className="sa-serp__desc">{shownDescription}</div>
          </div>

          {draft[file] && <Button variant="danger" size="sm" onClick={() => removeOverride(file)}>{COPY.removeOverride}</Button>}
        </section>
      )}

      <div className="home-h">{COPY.listHeading}</div>
      {overridden.length === 0 ? <p className="pr-note">{COPY.listEmpty}</p> : (
        <div className="dtable-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th scope="col">{COPY.listColumns.page}</th>
                <th scope="col">{COPY.listColumns.title}</th>
                <th scope="col">{COPY.listColumns.description}</th>
                <th scope="col">{COPY.listColumns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {overridden.map(([key, entry]) => {
                const known = pageOf(key);
                return (
                  <tr key={key}>
                    <th scope="row">{known ? known.title : <Chip tone="danger">{COPY.unknownPage}</Chip>}<code>{key}</code></th>
                    <td>{entry.title || <em>{COPY.generatedMark}</em>}</td>
                    <td>{entry.description || <em>{COPY.generatedMark}</em>}</td>
                    <td>
                      <Button size="sm" variant="ghost" aria-label={COPY.editLabel(known ? known.title : key)} disabled={!known} onClick={() => setFile(key)}>{COPY.edit}</Button>
                      <Button size="sm" variant="ghost" aria-label={COPY.removeLabel(known ? known.title : key)} onClick={() => removeOverride(key)}>{COPY.remove}</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SaveBar site={site} dirty={dirty} onCheck={check} onSave={save} onDiscard={discard} onReload={reload} />
    </>
  );
}
