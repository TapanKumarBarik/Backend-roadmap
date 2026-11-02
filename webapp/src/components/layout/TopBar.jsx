import { useRef, useState } from 'react';
import {
  HamburgerIcon, SearchIcon, SunIcon, MoonIcon, AutoIcon, MenuDotsIcon,
  ExportIcon, ImportIcon, ResetIcon, ExpandIcon, CollapseIcon, KeysIcon, SignOutIcon, TrashIcon,
  MailIcon, ClockIcon, GithubIcon, YoutubeIcon
} from '../common/icons.jsx';
import SignInButton from '../account/SignInButton.jsx';
import UserAvatar from '../account/UserAvatar.jsx';
import BrandMark from '../common/BrandMark.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Menu, MenuHeader, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu.jsx';
import ShortcutsDialog from './ShortcutsDialog.jsx';
import { BUILD_TIME } from '../../lib/buildInfo.js';
import { describeActivity } from '../../lib/comments.js';
import { CONTRIBUTE_URL } from '../../lib/curriculum/contribute.js';
import { DEVELOPER, SITE, YOUTUBE } from '../../config/index.js';
import { CONTACT } from '../../config/messages.js';

const THEME_ICON = { auto: AutoIcon, light: SunIcon, dark: MoonIcon };
const openOutside = (url) => window.open(url, '_blank', 'noopener,noreferrer');

export default function TopBar({
  counts, pathProgress, theme, onCycleTheme, user, authLoading, onLogin, onLogout,
  onOpenPalette, onGoHome,
  onExport, onImportFile, onReset, onExpandAll, onCollapseAll, onMobileToggle,
  onDeleteAccount, onOpenMessage, onToast, streak,
  activity, onOpenActivity, nodeByFile
}) {
  const importInputRef = useRef(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const ThemeIcon = THEME_ICON[theme] || AutoIcon;
  // With a path picked the bar measures that path (it has a finish line); otherwise the whole library.
  const scope = pathProgress || counts;
  const pct = scope.total ? Math.round((scope.done / scope.total) * 100) : 0;
  const statSummary = pathProgress
    ? `${scope.done} of ${scope.total} modules done on your path, ${pathProgress.title}`
    : `${scope.done} of ${scope.total} modules complete`;

  const showDeployed = () => onToast(BUILD_TIME
    ? `Last deployed ${new Date(BUILD_TIME).toLocaleString()}`
    : 'Last deployed: unknown (dev build)');

  return (
    <header id="topbar">
      {/* Null on destination screens — there's no curriculum tree to open
          there, so the button would do nothing. */}
      {onMobileToggle && (
        <button className="icon-btn" id="mobileToggle" title="Menu" aria-label="Toggle navigation" onClick={onMobileToggle}>
          <HamburgerIcon />
        </button>
      )}
      {/* The hide-the-tree control used to live here: an unlabelled icon in
          the far top-left, nowhere near the panel it controlled, and easy
          to confuse with the destination rail now that one exists. It moved
          onto the panel itself. */}
      <button className="brand" onClick={onGoHome} type="button" aria-label={`${SITE.name} — home`}>
        <BrandMark />
        <span>{SITE.name}</span>
      </button>
      <button id="searchTrigger" onClick={() => onOpenPalette()}>
        <SearchIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
        <span>Search modules &amp; tags…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="spacer" />
      {/* Was a bare bar plus "0%" — no label, no action, no meaning to a
          first-time visitor. One control now: what it measures, where you
          are, your streak, and somewhere to go when you click it. */}
      <button
        id="globalStat"
        onClick={onGoHome}
        title={`${statSummary} — open your curriculum`}
        aria-label={`Progress: ${pct} percent, ${statSummary}. Open your curriculum.`}
      >
        <span className="bar">
          <i className="d" style={{ width: scope.total ? (scope.done / scope.total) * 100 + '%' : '0%' }} />
          <i className="w" style={{ width: scope.total ? (scope.wip / scope.total) * 100 + '%' : '0%' }} />
        </span>
        <strong>{pct}%</strong>
        <span className="lbl">{pathProgress ? 'of path' : 'done'}</span>
        {streak && streak.currentStreak > 1 && (
          <span className="streak" title={`${streak.currentStreak}-day streak · longest ${streak.longestStreak}`}>
            · 🔥 {streak.currentStreak}
          </span>
        )}
      </button>

      {/* Until the server has said who is signed in there is no button at all: showing "Sign in with Google" for a
          moment to someone who is signed in looked like being signed out. */}
      {authLoading && <span className="ui-avatar-skeleton" aria-hidden="true" />}
      {!authLoading && !user && <SignInButton onClick={onLogin} />}
      {!authLoading && user && (
        <Menu
          onOpenChange={(open) => { if (open) activity?.markSeen(); }}
          trigger={(
            <IconButton
              id="authBtn"
              label={`Account menu — signed in as ${user.email}${activity?.badgeVisible ? `, ${activity.label}` : ''}`}
              title={`Signed in as ${user.email}`}
            >
              <UserAvatar user={user} />
              {activity?.badgeVisible && <span className="activity-dot">{activity.count > 9 ? '9+' : activity.count}</span>}
            </IconButton>
          )}
        >
          <MenuHeader>
            <strong>{user.name || user.email}</strong>
            {user.name && <span>{user.email}</span>}
            {streak && streak.currentStreak > 1 && <span>🔥 {streak.currentStreak}-day streak</span>}
          </MenuHeader>
          {activity && activity.items.length > 0 && (
            <>
              <MenuLabel>{activity.label || 'New activity'}</MenuLabel>
              {activity.items.map((item) => {
                const { what, where } = describeActivity(item, (path) => nodeByFile?.[path]?.title || nodeByFile?.[path]?.name || path);
                return (
                  <MenuItem key={item.id} icon={<MailIcon />} onSelect={() => onOpenActivity(item)}>
                    {what}
                    <small className="ui-menu__sub">{where}</small>
                  </MenuItem>
                );
              })}
              <MenuSeparator />
            </>
          )}
          {onOpenMessage && <MenuItem icon={<MailIcon />} onSelect={onOpenMessage}>{CONTACT.messageDeveloper(DEVELOPER.shortName)}</MenuItem>}
          <MenuItem icon={<SignOutIcon />} onSelect={onLogout}>Sign out</MenuItem>
          {onDeleteAccount && <MenuItem tone="danger" icon={<TrashIcon />} onSelect={onDeleteAccount}>Delete account &amp; data</MenuItem>}
        </Menu>
      )}

      <IconButton id="themeBtn" label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme} (press T)`} onClick={onCycleTheme}>
        <ThemeIcon />
      </IconButton>

      <Menu trigger={<IconButton id="menuBtn" label="More options"><MenuDotsIcon /></IconButton>}>
        <MenuLabel>Progress</MenuLabel>
        <MenuItem icon={<ExportIcon />} onSelect={onExport}>Export progress (.json)</MenuItem>
        <MenuItem icon={<ImportIcon />} onSelect={() => importInputRef.current?.click()}>Import progress…</MenuItem>
        <MenuItem icon={<ResetIcon />} onSelect={onReset}>Reset all progress</MenuItem>
        <MenuSeparator />
        <MenuLabel>View</MenuLabel>
        <MenuItem icon={<ExpandIcon />} onSelect={onExpandAll}>Expand all</MenuItem>
        <MenuItem icon={<CollapseIcon />} onSelect={onCollapseAll}>Collapse all</MenuItem>
        <MenuSeparator />
        <MenuLabel>Open source</MenuLabel>
        <MenuItem icon={<GithubIcon />} onSelect={() => openOutside(CONTRIBUTE_URL)}>Contribute on GitHub</MenuItem>
        <MenuItem icon={<YoutubeIcon />} onSelect={() => openOutside(YOUTUBE.channel)}>Watch on YouTube</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<KeysIcon />} onSelect={() => setShortcutsOpen(true)}>Keyboard shortcuts</MenuItem>
        <MenuItem icon={<ClockIcon />} onSelect={showDeployed}>Last deployed</MenuItem>
      </Menu>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <input
        type="file" id="importFile" accept="application/json" style={{ display: 'none' }}
        ref={importInputRef}
        onChange={async (e) => {
          const file = e.target.files[0];
          if (file) await onImportFile(file);
          e.target.value = '';
        }}
      />
    </header>
  );
}
