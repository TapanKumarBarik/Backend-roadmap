import { TreeIcon, StarIcon, CompassIcon, FeedIcon, GearIcon } from '../icons.jsx';

// The permanent left edge: where you can go, not what's in the thing
// you're looking at. Splitting this out is what lets the curriculum tree
// stop being permanent — the tree is context for the curriculum, and has
// no business sitting beside the community feed or the admin dashboard.
export default function DestinationRail({
  activeDest, user, isAdmin,
  onOpenCurriculum, onOpenExplore, onOpenSaved, onOpenCommunity, onOpenAdmin
}) {
  const items = [
    { key: null, label: 'Curriculum', Icon: TreeIcon, onClick: onOpenCurriculum, show: true },
    { key: '__explore', label: 'Explore', Icon: CompassIcon, onClick: onOpenExplore, show: true },
    { key: '__saved', label: 'Saved', Icon: StarIcon, onClick: onOpenSaved, show: !!user },
    { key: '__community', label: 'Community', Icon: FeedIcon, onClick: onOpenCommunity, show: true },
    { key: '__admin', label: 'Admin', Icon: GearIcon, onClick: onOpenAdmin, show: isAdmin }
  ].filter((i) => i.show);

  return (
    <nav id="destRail" aria-label="Sections">
      {items.map(({ key, label, Icon, onClick }) => {
        const on = activeDest === key;
        return (
          <button
            key={label}
            className={'dest-btn' + (on ? ' on' : '')}
            aria-current={on ? 'page' : undefined}
            aria-label={label}
            onClick={onClick}
          >
            <Icon />
            <span className="dest-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
