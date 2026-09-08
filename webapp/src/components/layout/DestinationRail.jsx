import { TreeIcon, StarIcon, CompassIcon, FeedIcon, QuestionIcon, BookIcon, LightbulbIcon, GearIcon } from '../icons.jsx';

// The permanent left edge: where you can go, not what's in the thing
// you're looking at. Splitting this out is what lets the curriculum tree
// stop being permanent — the tree is context for the curriculum, and has
// no business sitting beside the community feed or the admin dashboard.
//
// Feed and Community used to be one destination (Feed was a tab inside
// Community) — split into two so the feed reads as its own place, the
// way it does on a site actually built around a feed, rather than as a
// third tab behind Questions/Unanswered.
export default function DestinationRail({
  activeDest, user, isAdmin,
  onOpenCurriculum, onOpenExplore, onOpenSaved, onOpenFeed, onOpenCommunity, onOpenBooks, onOpenSuggestions, onOpenAdmin,
  feedBadge, communityBadge
}) {
  const items = [
    { key: null, label: 'Curriculum', Icon: TreeIcon, onClick: onOpenCurriculum, show: true },
    { key: '__explore', label: 'Explore', Icon: CompassIcon, onClick: onOpenExplore, show: true },
    { key: '__saved', label: 'Saved', Icon: StarIcon, onClick: onOpenSaved, show: !!user },
    // Both carry the "something's new" dot — someone else's post, and
    // someone else's question, are each things that happen without you
    // (same pattern as the account menu's reply badge, see
    // useCommunityActivity). The other destinations are just views onto
    // your own state; there's nothing there to be notified of.
    { key: '__feed', label: 'Feed', Icon: FeedIcon, onClick: onOpenFeed, show: true, badge: feedBadge },
    { key: '__community', label: 'Community', Icon: QuestionIcon, onClick: onOpenCommunity, show: true, badge: communityBadge },
    { key: '__books', label: 'Books', Icon: BookIcon, onClick: onOpenBooks, show: true },
    { key: '__suggestions', label: 'Suggestions', Icon: LightbulbIcon, onClick: onOpenSuggestions, show: true },
    { key: '__admin', label: 'Admin', Icon: GearIcon, onClick: onOpenAdmin, show: isAdmin }
  ].filter((i) => i.show);

  return (
    <nav id="destRail" aria-label="Sections">
      {items.map(({ key, label, Icon, onClick, badge }) => {
        const on = activeDest === key;
        return (
          <button
            key={label}
            className={'dest-btn' + (on ? ' on' : '')}
            aria-current={on ? 'page' : undefined}
            aria-label={badge ? `${label} — new activity` : label}
            onClick={onClick}
          >
            <Icon />
            {badge && <span className="activity-dot" aria-hidden="true" />}
            <span className="dest-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
