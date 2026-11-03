import { useState } from 'react';
import { useLoader } from '../../hooks/useLoader.js';
import { useSiteFile } from '../../hooks/useSiteFile.js';
import { fetchModuleIndex } from '../../lib/siteContentApi.js';
import { SITE_FILES } from '../../lib/siteContent/index.js';
import { PLAYLIST_ID, PLAYLIST_URL } from '../../lib/siteContent/videos.js';
import { watchUrl } from '../../lib/markdown/videoCard.js';
import { SAVE_BAR, SITE_ADMIN, VIDEOS_EDITOR } from '../../config/siteAdmin.js';
import { Button } from '../ui/Button.jsx';
import { Chip, ChoiceChip } from '../ui/Chip.jsx';
import { TextField, SelectField } from '../ui/Field.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import SaveBar from './SaveBar.jsx';

const COPY = VIDEOS_EDITOR;
const NEW_PLAYLIST = { id: '', title: '', url: '' };

// What is committed: the texts trimmed, a module or a lesson id that was cleared left out.
function tidy(registry) {
  const videos = registry.videos.map((v) => {
    const clean = { ...v, title: String(v.title ?? '').trim() };
    for (const key of ['module', 'lesson']) {
      const text = String(v[key] ?? '').trim();
      if (text) clean[key] = text; else delete clean[key];
    }
    return clean;
  });
  const playlists = registry.playlists.map((p) => ({ ...p, title: String(p.title ?? '').trim(), url: String(p.url ?? '').trim() }));
  return { ...registry, playlists, videos };
}

// The YouTube settings (content/videos.json): the playlists, and a table of the videos where each one is given its module (the lesson it
// plays in), picked from the site's real modules. It never calls YouTube: new videos arrive with `npm run videos:sync`. The server checks the
// same rules as `npm run check:videos`, and that every module exists on the site as deployed.
export default function VideosEditor({ onToast }) {
  const site = useSiteFile(SITE_FILES.videos, { playlists: [], videos: [] });
  const { data: modules, error: modulesError, reload: reloadModules } = useLoader(fetchModuleIndex);
  const confirm = useConfirm();
  const [edits, setEdits] = useState(null);
  const [fresh, setFresh] = useState(NEW_PLAYLIST);
  const [query, setQuery] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [noModule, setNoModule] = useState(false);
  const [shown, setShown] = useState(SITE_ADMIN.videoPage);

  if (site.error) return <LoadError error={site.error} what={SITE_ADMIN.loading.videos} onRetry={site.reload} />;
  if (modulesError) return <LoadError error={modulesError} what={SITE_ADMIN.loading.modules} onRetry={reloadModules} />;
  if (!site.file || !modules) return <Skeleton lines={6} />;

  const draft = edits || site.file.value;
  const { playlists, videos } = draft;
  const dirty = edits !== null && JSON.stringify(tidy(edits)) !== JSON.stringify(site.file.value);
  const titles = new Map(modules.pages.map((p) => [p.folder, p.title]));
  const saved = new Map(site.file.value.videos.map((v) => [v.id, JSON.stringify(v)]));
  const counts = new Map();
  for (const v of videos) counts.set(v.playlist, (counts.get(v.playlist) || 0) + 1);
  const hasModule = (v) => Boolean(String(v.module ?? '').trim());
  const withoutModule = videos.filter((v) => !hasModule(v)).length;

  const needle = query.trim().toLowerCase();
  const matches = videos.filter((v) => (!playlistFilter || v.playlist === playlistFilter)
    && (!noModule || !hasModule(v))
    && (!needle || [v.title, v.id, v.lesson, v.module].some((text) => String(text ?? '').toLowerCase().includes(needle))));

  const setVideo = (id, changes) => setEdits({ ...draft, videos: videos.map((v) => (v.id === id ? { ...v, ...changes } : v)) });
  const setPlaylists = (next) => setEdits({ ...draft, playlists: next });
  const patchPlaylist = (id, changes) => setPlaylists(playlists.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const newId = fresh.id.trim();
  const idError = newId && (!PLAYLIST_ID.test(newId) ? COPY.addBadId : playlists.some((p) => p.id === newId) ? COPY.addTaken : '');
  const urlError = fresh.url.trim() && !PLAYLIST_URL.test(fresh.url.trim()) ? COPY.addBadUrl : '';
  const canAdd = newId && fresh.title.trim() && fresh.url.trim() && !idError && !urlError;
  function addPlaylist() {
    setPlaylists([...playlists, { id: newId, title: fresh.title.trim(), url: fresh.url.trim() }]);
    setFresh(NEW_PLAYLIST);
  }
  async function removePlaylist(p) {
    if (await confirm({ title: COPY.playlistRemoveTitle(p.title || p.id), body: COPY.playlistRemoveBody, confirmLabel: COPY.playlistRemoveConfirm, tone: 'danger' })) {
      setPlaylists(playlists.filter((other) => other.id !== p.id));
    }
  }

  const check = async () => { if (await site.check(tidy(draft))) onToast(SAVE_BAR.good); };
  async function save() {
    if (await site.save(tidy(draft))) { setEdits(null); onToast(SAVE_BAR.saved); }
  }
  const discard = () => { setEdits(null); site.forget(); };
  const reload = () => { setEdits(null); return site.reload(); };

  const rows = matches.slice(0, shown);

  return (
    <>
      <div className="home-h">{COPY.heading}</div>
      <p className="pr-note">{COPY.lead}</p>
      <datalist id={SITE_ADMIN.ids.modules}>
        {modules.pages.map((page) => <option key={page.file} value={page.folder} label={page.title} />)}
      </datalist>

      <div className="home-h">{COPY.playlistsHeading}</div>
      <div className="dtable-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th scope="col">{COPY.playlistColumns.id}</th>
              <th scope="col">{COPY.playlistColumns.title}</th>
              <th scope="col">{COPY.playlistColumns.url}</th>
              <th scope="col">{COPY.playlistColumns.videos}</th>
              <th scope="col">{COPY.playlistColumns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {playlists.map((p) => {
              const used = counts.get(p.id) || 0;
              return (
                <tr key={p.id}>
                  <th scope="row"><code>{p.id}</code></th>
                  <td><input className="ui-field__control" aria-label={COPY.playlistTitle(p.id)} value={p.title} onChange={(e) => patchPlaylist(p.id, { title: e.target.value })} /></td>
                  <td><input className="ui-field__control" aria-label={COPY.playlistUrl(p.id)} value={p.url} onChange={(e) => patchPlaylist(p.id, { url: e.target.value })} /></td>
                  <td>{used ? COPY.playlistInUse(used) : 0}</td>
                  <td><Button size="sm" variant="ghost" disabled={used > 0} aria-label={COPY.playlistRemoveLabel(p.id)} onClick={() => removePlaylist(p)}>{COPY.playlistRemove}</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <fieldset className="sa-new">
        <legend>{COPY.addPlaylist}</legend>
        <TextField label={COPY.addId} value={fresh.id} error={idError} onChange={(e) => setFresh({ ...fresh, id: e.target.value })} />
        <TextField label={COPY.addTitle} value={fresh.title} onChange={(e) => setFresh({ ...fresh, title: e.target.value })} />
        <TextField label={COPY.addUrl} value={fresh.url} error={urlError} onChange={(e) => setFresh({ ...fresh, url: e.target.value })} />
        <Button variant="secondary" disabled={!canAdd} onClick={addPlaylist}>{COPY.addButton}</Button>
      </fieldset>

      <div className="home-h">{COPY.videosHeading}</div>
      <div className="sa-filters">
        <TextField label={COPY.search} hint={COPY.searchHint} value={query} onChange={(e) => { setQuery(e.target.value); setShown(SITE_ADMIN.videoPage); }} />
        <SelectField label={COPY.playlistFilter} value={playlistFilter} onChange={(e) => { setPlaylistFilter(e.target.value); setShown(SITE_ADMIN.videoPage); }}>
          <option value="">{COPY.allPlaylists}</option>
          {playlists.map((p) => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
        </SelectField>
        <ChoiceChip selected={noModule} onClick={() => { setNoModule(!noModule); setShown(SITE_ADMIN.videoPage); }}>{COPY.noModuleOnly(withoutModule)}</ChoiceChip>
      </div>
      <p className="pr-note" aria-live="polite">{matches.length ? COPY.count(matches.length, videos.length) : COPY.none}</p>

      {rows.length > 0 && (
        <div className="dtable-wrap">
          <table className="dtable sa-videos">
            <thead>
              <tr>
                <th scope="col">{COPY.columns.number}</th>
                <th scope="col">{COPY.columns.title}</th>
                <th scope="col">{COPY.columns.lesson}</th>
                <th scope="col">{COPY.columns.module}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const folder = String(v.module ?? '').trim();
                return (
                  <tr key={v.id}>
                    <th scope="row">
                      <code>{v.playlist} #{v.number}</code>
                      <a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer" aria-label={COPY.watchLabel(v.title)}>{COPY.watch}</a>
                      {saved.get(v.id) !== JSON.stringify(v) && <Chip tone="signal">{COPY.changed}</Chip>}
                    </th>
                    <td><input className="ui-field__control" aria-label={COPY.titleOf(`${v.playlist} #${v.number}`)} value={v.title} onChange={(e) => setVideo(v.id, { title: e.target.value })} /></td>
                    <td><input className="ui-field__control" aria-label={COPY.lessonOf(v.title)} value={v.lesson ?? ''} onChange={(e) => setVideo(v.id, { lesson: e.target.value })} /></td>
                    <td>
                      <input
                        className="ui-field__control"
                        aria-label={COPY.moduleOf(v.title)}
                        list={SITE_ADMIN.ids.modules}
                        placeholder={COPY.modulePlaceholder}
                        value={v.module ?? ''}
                        onChange={(e) => setVideo(v.id, { module: e.target.value })}
                      />
                      {!folder && <Chip tone="signal">{COPY.noModule}</Chip>}
                      {folder && !titles.has(folder) && <Chip tone="danger">{COPY.moduleMissing}</Chip>}
                      {folder && titles.has(folder) && <span className="sa-hint">{COPY.moduleNamed(titles.get(folder))}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {matches.length > rows.length && (
        <Button variant="secondary" onClick={() => setShown(shown + SITE_ADMIN.videoPage)}>{COPY.more(Math.min(SITE_ADMIN.videoPage, matches.length - rows.length))}</Button>
      )}

      <SaveBar site={site} dirty={dirty} onCheck={check} onSave={save} onDiscard={discard} onReload={reload} />
    </>
  );
}
