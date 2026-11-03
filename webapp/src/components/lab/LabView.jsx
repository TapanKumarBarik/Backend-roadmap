import { useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { LAB_ROUTE, pageUrl } from '../../lib/appPages.js';
import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { LAB } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Tabs, TabPanel } from '../ui/Tabs.jsx';
import { Card } from '../ui/Card.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import ChallengeView from './ChallengeView.jsx';
import '../../styles/practice.css';

// The Design Lab: low-level and high-level design challenges. A challenge opens in place (/design-lab/lld/<slug>/).
export default function LabView({ item, onOpenItem, onOpenFile, user, onLogin, onToast, nodeByFile }) {
  const [tab, setTab] = useState('lld');
  const { data: catalog, error, reload } = useLoader(fetchPracticeCatalog);
  usePageTitle(item ? null : LAB.title);
  const [kind, slug] = item ? item.split('/') : [];
  if (kind && slug) return <ChallengeView kind={kind} slug={slug} onBack={() => onOpenItem(null)} onOpenFile={onOpenFile} user={user} onLogin={onLogin} onToast={onToast} nodeByFile={nodeByFile} />;

  const current = LAB.tabs.find((t) => t.id === tab);
  const shown = catalog ? catalog.challenges.filter((c) => c.kind === tab) : [];
  return (
    <div id="empty" className="pr-screen">
      <h2>{LAB.title}</h2>
      <p className="home-sub">{LAB.intro}</p>
      <Tabs label={LAB.title} value={tab} onChange={setTab} tabs={LAB.tabs.map(({ id, label }) => ({ id, label }))} idPrefix="lab" />
      <TabPanel id={tab} value={tab} idPrefix="lab">
        <p className="pr-note">{current.blurb}</p>
        {error && <LoadError error={error} what={LOAD_WHAT.challenge} onRetry={reload} />}
        {!catalog && !error && <Loading />}
        <ul className="pr-cards">
          {shown.map((c) => (
            <li key={c.key}>
              <Card as="article" className="pr-card">
                <h3 className="pr-card__title">
                  <a href={pageUrl(LAB_ROUTE, c.key)} onClick={(e) => { e.preventDefault(); onOpenItem(c.key); }}>{c.title}</a>
                </h3>
                <p className="pr-card__text">{c.summary}</p>
              </Card>
            </li>
          ))}
        </ul>
      </TabPanel>
    </div>
  );
}
