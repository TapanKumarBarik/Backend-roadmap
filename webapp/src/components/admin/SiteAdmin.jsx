import { useState } from 'react';
import { SITE_ADMIN } from '../../config/siteAdmin.js';
import { TabPanel, Tabs } from '../ui/Tabs.jsx';
import PathsEditor from './PathsEditor.jsx';
import VideosEditor from './VideosEditor.jsx';
import SeoEditor from './SeoEditor.jsx';
import '../../styles/site-admin.css';

// The admin's "Site" section: the three files that shape what the site and search engines show, edited without a code editor. Each tab is
// one file (content/paths.json, videos.json, seo.json); saving commits it to the repository through the same endpoint as the practice content.
export default function SiteAdmin({ onToast = () => {} }) {
  const [tab, setTab] = useState(SITE_ADMIN.tabs[0].id);
  return (
    <>
      <p className="pr-note">{SITE_ADMIN.lead}</p>
      <Tabs label={SITE_ADMIN.tabsLabel} value={tab} onChange={setTab} tabs={SITE_ADMIN.tabs} idPrefix="site-admin" />
      <TabPanel id="paths" value={tab} idPrefix="site-admin"><PathsEditor onToast={onToast} /></TabPanel>
      <TabPanel id="videos" value={tab} idPrefix="site-admin"><VideosEditor onToast={onToast} /></TabPanel>
      <TabPanel id="seo" value={tab} idPrefix="site-admin"><SeoEditor onToast={onToast} /></TabPanel>
    </>
  );
}
