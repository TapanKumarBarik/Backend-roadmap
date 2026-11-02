import { useState } from 'react';
import { TreeIcon, StarIcon, CompassIcon, FeedIcon, QuestionIcon, BookIcon, LightbulbIcon, WorkspaceIcon, GearIcon, YoutubeIcon, MenuDotsIcon, ArticleIcon } from '../common/icons.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { Dialog } from '../ui/Dialog.jsx';

// The permanent left edge: where you can go, not what's in the thing
// you're looking at. Splitting this out is what lets the curriculum tree
// stop being permanent — the tree is context for the curriculum, and has
// no business sitting beside the community feed or the admin dashboard.
//
// Every destination carries its name (an icon on its own said nothing to anyone who had not memorised it), in groups:
// learn, community, you. On a phone it is the bottom bar: the destinations that matter most, and a "More" sheet for
// the rest, because nine labels do not fit in 390px.
//
// Feed and Community used to be one destination (Feed was a tab inside
// Community) — split into two so the feed reads as its own place, the
// way it does on a site actually built around a feed, rather than as a
// third tab behind Questions/Unanswered.
const GROUPS = [
  { id: 'learn', label: 'Learn' },
  { id: 'community', label: 'Community' },
  { id: 'you', label: 'You' },
  { id: 'admin', label: 'Admin' }
];

export default function DestinationRail({
  activeDest, user, isAdmin,
  onOpenCurriculum, onOpenExplore, onOpenVideos, onOpenSaved, onOpenBlogs, onOpenFeed, onOpenCommunity, onOpenBooks, onOpenSuggestions, onOpenWorkspace, onOpenAdmin,
  hasVideos, feedBadge, communityBadge
}) {
  const phone = useMediaQuery('(max-width: 860px)');
  const [moreOpen, setMoreOpen] = useState(false);

  // `primary` ones stay in the phone's bottom bar; the rest go behind "More".
  const items = [
    { key: null, label: 'Curriculum', Icon: TreeIcon, onClick: onOpenCurriculum, group: 'learn', primary: true },
    { key: '__explore', label: 'Explore', Icon: CompassIcon, onClick: onOpenExplore, group: 'learn', primary: true },
    // The channel's videos; shown once there are some (content/videos.json).
    { key: '__videos', label: 'Videos', Icon: YoutubeIcon, onClick: onOpenVideos, group: 'learn', primary: true, show: !!hasVideos },
    // Both carry the "something's new" dot — someone else's post, and
    // someone else's question, are each things that happen without you
    // (same pattern as the account menu's reply badge, see
    // useCommunityActivity). The other destinations are just views onto
    // your own state; there's nothing there to be notified of.
    // The community's articles; the feed's quick posts sit beside them.
    { key: '__blog', label: 'Blogs', Icon: ArticleIcon, onClick: onOpenBlogs, group: 'community', primary: true },
    { key: '__feed', label: 'Feed', Icon: FeedIcon, onClick: onOpenFeed, group: 'community', badge: feedBadge },
    { key: '__community', label: 'Community', Icon: QuestionIcon, onClick: onOpenCommunity, group: 'community', badge: communityBadge },
    { key: '__books', label: 'Books', Icon: BookIcon, onClick: onOpenBooks, group: 'community' },
    { key: '__suggestions', label: 'Suggestions', Icon: LightbulbIcon, onClick: onOpenSuggestions, group: 'community' },
    // Private to the signed-in user, like Saved — shown only once signed in,
    // unlike Feed/Books/Suggestions/Community which are public to browse.
    { key: '__saved', label: 'Saved', Icon: StarIcon, onClick: onOpenSaved, group: 'you', show: !!user },
    { key: '__workspace', label: 'Workspace', Icon: WorkspaceIcon, onClick: onOpenWorkspace, group: 'you', show: !!user },
    { key: '__admin', label: 'Admin', Icon: GearIcon, onClick: onOpenAdmin, group: 'admin', show: isAdmin }
  ].filter((item) => item.show !== false);

  const button = (item, { inSheet = false } = {}) => {
    const { key, label, Icon, onClick, badge } = item;
    const on = activeDest === key;
    return (
      <button
        key={label}
        className={'dest-btn' + (on ? ' on' : '')}
        aria-current={on ? 'page' : undefined}
        aria-label={badge ? `${label} — new activity` : undefined}
        onClick={() => { if (inSheet) setMoreOpen(false); onClick(); }}
      >
        <Icon />
        {badge && <span className="activity-dot" aria-hidden="true" />}
        <span className="dest-label">{label}</span>
      </button>
    );
  };

  if (phone) {
    const bar = items.filter((item) => item.primary);
    const more = items.filter((item) => !item.primary);
    const moreActive = more.some((item) => item.key === activeDest);
    const moreBadge = more.some((item) => item.badge);
    return (
      <nav id="destRail" aria-label="Sections">
        {bar.map((item) => button(item))}
        {more.length > 0 && (
          <button
            className={'dest-btn' + (moreActive ? ' on' : '')}
            aria-haspopup="dialog"
            aria-label={moreBadge ? 'More — new activity' : undefined}
            onClick={() => setMoreOpen(true)}
          >
            <MenuDotsIcon />
            {moreBadge && <span className="activity-dot" aria-hidden="true" />}
            <span className="dest-label">More</span>
          </button>
        )}
        <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More places" sheet size="sm">
          <div className="more-sheet">
            {GROUPS.map((group) => {
              const inGroup = more.filter((item) => item.group === group.id);
              if (!inGroup.length) return null;
              return (
                <section key={group.id} aria-label={group.label}>
                  <h3 className="more-sheet__group">{group.label}</h3>
                  <div className="more-sheet__grid">{inGroup.map((item) => button(item, { inSheet: true }))}</div>
                </section>
              );
            })}
          </div>
        </Dialog>
      </nav>
    );
  }

  return (
    <nav id="destRail" aria-label="Sections">
      {GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.group === group.id);
        if (!inGroup.length) return null;
        return (
          <div key={group.id} className="dest-group" role="group" aria-label={group.label}>
            {inGroup.map((item) => button(item))}
          </div>
        );
      })}
    </nav>
  );
}
