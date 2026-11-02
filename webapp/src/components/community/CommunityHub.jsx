import { Suspense, useEffect, useRef } from 'react';
import { COMMUNITY } from '../../config/community.js';
import { Tabs, TabPanel } from '../ui/Tabs.jsx';
import Loading from '../common/Loading.jsx';

// The community in one place: questions on the modules, posts, resources (books) and ideas, as four tabs. Each tab is a screen of its
// own with an address of its own (config/community.js), and this is the frame they share; it stays on the page while the tab changes,
// so the keyboard stays on the tab that was chosen. A tab's screen is loaded when it is first opened: while it is on its way only the
// panel waits (its own Suspense), because a boundary around the tabs themselves would hide the one that has the focus.
//
//   active     the id of the open tab
//   onOpen     (id) => go to that tab
//   activity   { [tab id]: { badgeVisible, markSeen } } for the tabs that can have something new (useCommunityActivity.js); opening
//              such a tab marks it seen
export default function CommunityHub({ active, onOpen, activity = {}, children }) {
  // Opening a tab is looking at what is new in it.
  const markSeen = activity[active]?.markSeen;
  useEffect(() => { if (markSeen) markSeen(); }, [markSeen]);

  // A tab starts at its top, not wherever the last one was left.
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) { opened.current = true; return; }
    const scroller = document.getElementById('main');
    if (scroller) scroller.scrollTop = 0;
  }, [active]);

  // A tab says it has news only when it is not the one you are looking at.
  const tabs = COMMUNITY.tabs.map(({ id, label }) => ({ id, label, ...(id !== active && activity[id]?.badgeVisible ? { badge: COMMUNITY.newLabel, badgeTone: 'signal' } : {}) }));
  return (
    <div id="empty" className="community-hub">
      <h2>{COMMUNITY.title}</h2>
      <p className="home-sub">{COMMUNITY.intro}</p>
      <Tabs label={COMMUNITY.title} value={active} onChange={onOpen} tabs={tabs} idPrefix="community" />
      <TabPanel id={active} value={active} idPrefix="community">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </TabPanel>
    </div>
  );
}
