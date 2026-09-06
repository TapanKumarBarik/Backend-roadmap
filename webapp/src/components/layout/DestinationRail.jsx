import { TreeIcon, StarIcon, CompassIcon, FeedIcon, GearIcon } from '../icons.jsx';

// The permanent left edge: where you can go, not what's in the thing
// you're looking at. Splitting this out is what lets the curriculum tree
// stop being permanent — the tree is context for the curriculum, and has
// no business sitting beside the community feed or the admin dashboard.
export default function DestinationRail({
  activeDest, user, isAdmin,
  onOpenCurriculum, onOpenExplore, onOpenSaved, onOpenCommunity, onOpenAdmin,
  communityBadge
}) {
  const items = [
    { key: null, label: 'Curriculum', Icon: TreeIcon, onClick: onOpenCurriculum, show: true },
    { key: '__explore', label: 'Explore', Icon: CompassIcon, onClick: onOpenExplore, show: true },
    { key: '__saved', label: 'Saved', Icon: StarIcon, onClick: onOpenSaved, show: !!user },
    // The one place in this rail something can actually happen without you —
    // someone else's post or question — so it's the only item that carries
    // a "something's new" dot (same pattern as the account menu's reply
    // badge, see useCommunityActivity). The other destinations are just
    // views onto your own state; there's nothing there to be notified of.
    { key: '__community', label: 'Community', Icon: FeedIcon, onClick: onOpenCommunity, show: true, badge: communityBadge },
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
