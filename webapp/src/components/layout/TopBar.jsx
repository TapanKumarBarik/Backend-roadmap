import { useRef } from 'react';
import {
  HamburgerIcon, SearchIcon, SunIcon, MoonIcon, AutoIcon, MenuDotsIcon,
  ExportIcon, ImportIcon, ResetIcon, ExpandIcon, CollapseIcon, KeysIcon, SignOutIcon, TrashIcon,
  MailIcon, ClockIcon
} from '../icons.jsx';
import SignInButton from '../account/SignInButton.jsx';
import UserAvatar from '../account/UserAvatar.jsx';
import { BUILD_TIME } from '../../lib/buildInfo.js';

const THEME_ICON = { auto: AutoIcon, light: SunIcon, dark: MoonIcon };

export default function TopBar({
  counts, theme, onCycleTheme, user, onLogin, onLogout,
  menuOpen, onToggleMenu, onCloseMenu, onOpenPalette, onGoHome,
  onExport, onImportFile, onReset, onExpandAll, onCollapseAll, onMobileToggle,
  onDeleteAccount, onOpenMessage, onToast, streak,
  activity, onOpenFile, nodeByFile
}) {
  const importInputRef = useRef(null);
  const ThemeIcon = THEME_ICON[theme] || AutoIcon;
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

  function handleMenuAction(act) {
    onCloseMenu();
    if (act === 'export') onExport();
    else if (act === 'import') importInputRef.current?.click();
    else if (act === 'reset') onReset();
    else if (act === 'expand') onExpandAll();
    else if (act === 'collapse') onCollapseAll();
    else if (act === 'keys') {
      alert(
        'Keyboard shortcuts\n\n' +
        'Ctrl/⌘ K   Search modules\n' +
        '/          Search modules\n' +
        'J / K      Next / previous module\n' +
        'D          Mark current module done\n' +
        'W          Mark current module in progress\n' +
        'T          Cycle theme (auto / light / dark)\n' +
        'B          Toggle sidebar\n' +
        'Esc        Close search\n'
      );
    } else if (act === 'deployed') {
      onToast(BUILD_TIME
        ? `Last deployed ${new Date(BUILD_TIME).toLocaleString()}`
        : "Last deployed: unknown (dev build)");
    }
  }

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
      <button className="brand" onClick={onGoHome} type="button">
        <span className="mark">C</span><span>Curriculum</span>
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
        title={`${counts.done} of ${counts.total} modules complete — open your curriculum`}
        aria-label={`Progress: ${pct} percent, ${counts.done} of ${counts.total} modules complete. Open your curriculum.`}
      >
        <span className="bar">
          <i className="d" style={{ width: counts.total ? (counts.done / counts.total) * 100 + '%' : '0%' }} />
          <i className="w" style={{ width: counts.total ? (counts.wip / counts.total) * 100 + '%' : '0%' }} />
        </span>
        <strong>{pct}%</strong>
        <span className="lbl">done</span>
        {streak && streak.currentStreak > 1 && (
          <span className="streak" title={`${streak.currentStreak}-day streak · longest ${streak.longestStreak}`}>
            · 🔥 {streak.currentStreak}
          </span>
        )}
      </button>
      {user
        ? (
          <>
            <button className="icon-btn" id="authBtn" onClick={(e) => { e.stopPropagation(); onToggleMenu(); }} title={`Signed in as ${user.email}`} aria-label={`Account menu — signed in as ${user.email}${activity?.badgeVisible ? `, ${activity.count} new mentions` : ''}`} aria-haspopup="true" aria-expanded={menuOpen}>
              <UserAvatar user={user} />
              {activity?.badgeVisible && <span className="activity-dot">{activity.count > 9 ? '9+' : activity.count}</span>}
            </button>
          </>
        )
        : <SignInButton onClick={onLogin} />}
      <button className="icon-btn" id="themeBtn" title={`Theme: ${theme} (press T)`} aria-label={`Change theme (currently ${theme})`} onClick={onCycleTheme}>
        <ThemeIcon />
      </button>
      <button className="icon-btn" id="menuBtn" title="More" aria-label="More options" aria-haspopup="true" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}>
        <MenuDotsIcon />
      </button>

      <div id="menu" className={menuOpen ? 'show' : ''} onClick={(e) => e.stopPropagation()}>
        {user && (
          <>
            <div className="grp">
              {user.email}
              {streak && streak.currentStreak > 1 && ` · 🔥 ${streak.currentStreak}-day streak`}
            </div>
            {activity && activity.paths.length > 0 && (
              <>
                <div className="grp">New mentions</div>
                {activity.paths.map((p) => (
                  <button key={p} onClick={() => { onCloseMenu(); onOpenFile(p); }}>
                    <MailIcon />{(nodeByFile?.[p]?.title || nodeByFile?.[p]?.name || p)}
                  </button>
                ))}
                <div className="div" />
              </>
            )}
            {onOpenMessage && <button onClick={() => { onCloseMenu(); onOpenMessage(); }}><MailIcon />Message Tapan</button>}
            <button onClick={() => { onCloseMenu(); onLogout(); }}><SignOutIcon />Sign out</button>
            {onDeleteAccount && (
              <button className="danger" onClick={() => { onCloseMenu(); onDeleteAccount(); }}>
                <TrashIcon />Delete account &amp; data
              </button>
            )}
            <div className="div" />
          </>
        )}
        <div className="grp">Progress</div>
        <button onClick={() => handleMenuAction('export')}><ExportIcon />Export progress (.json)</button>
        <button onClick={() => handleMenuAction('import')}><ImportIcon />Import progress…</button>
        <button onClick={() => handleMenuAction('reset')}><ResetIcon />Reset all progress</button>
        <div className="div" />
        <div className="grp">View</div>
        <button onClick={() => handleMenuAction('expand')}><ExpandIcon />Expand all</button>
        <button onClick={() => handleMenuAction('collapse')}><CollapseIcon />Collapse all</button>
        <div className="div" />
        <button onClick={() => handleMenuAction('keys')}><KeysIcon />Keyboard shortcuts</button>
        <button onClick={() => handleMenuAction('deployed')}><ClockIcon />Last deployed</button>
      </div>

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
