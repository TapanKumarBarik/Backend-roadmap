import { useEffect, useState } from 'react';
import '../../styles/design.css';
import '../../styles/game.css';
import Crest from '../game/Crest.jsx';
import { Glyph, GLYPH_NAMES } from '../game/glyphs.jsx';
import { Button, IconButton } from '../ui/Button.jsx';
import { TextField, SelectField } from '../ui/Field.jsx';
import { Chip, ChoiceChip, Badge } from '../ui/Chip.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Card } from '../ui/Card.jsx';
import { Dialog, useConfirm } from '../ui/Dialog.jsx';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu.jsx';
import { Tabs, TabPanel } from '../ui/Tabs.jsx';
import { useToast } from '../ui/Toast.jsx';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { StarIcon, TrashIcon, MailIcon, BookIcon, MenuDotsIcon, PlayIcon } from '../common/icons.jsx';

// The living style guide (/#__design): every design token and shared component, drawn from the real thing. The colours
// are read back from the page's own computed styles, so this cannot drift from tokens.css, and it follows the theme.
// docs/DESIGN.md says when to use which.
const COLOURS = [
  ['Surfaces', ['--bg', '--bg-sunken', '--bg-raised']],
  ['Text', ['--fg', '--fg-muted', '--fg-subtle']],
  ['Lines', ['--border-subtle', '--border', '--border-strong']],
  ['State (the one accent)', ['--signal', '--signal-bg', '--signal-line', '--done', '--danger']],
  ['Links', ['--link', '--link-visited']],
  ['Reward (only ever for what has been earned)', ['--reward', '--reward-strong', '--reward-ink', '--reward-bg', '--reward-line', '--on-reward']]
];
const TYPE = ['--text-4xl', '--text-3xl', '--text-2xl', '--text-xl', '--text-lg', '--text-md', '--text-base', '--text-sm', '--text-xs', '--text-2xs'];
const SPACE = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12', '--space-16'];

// A custom property's value now, read again whenever the theme changes (the explicit toggle, or the system's).
function useTokenValues(names) {
  const read = () => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()]));
  const [values, setValues] = useState(read);
  useEffect(() => {
    const update = () => setValues(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    update();
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

function Section({ id, title, note, children }) {
  return (
    <section className="dz-section" aria-labelledby={`dz-${id}`}>
      <h2 id={`dz-${id}`}>{title}</h2>
      {note && <p className="dz-note">{note}</p>}
      {children}
    </section>
  );
}

export default function DesignView() {
  const toast = useToast();
  const confirm = useConfirm();
  const colours = useTokenValues(COLOURS.flatMap(([, names]) => names));
  const [tab, setTab] = useState('read');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [topic, setTopic] = useState('apis');
  const [replay, setReplay] = useState(0);
  const [loading, setLoading] = useState(false);

  return (
    <div className="dz">
      <header className="dz-head">
        <p className="dz-kicker">Design system</p>
        <h1>Blueprint</h1>
        <p className="dz-lead">
          Hairlines on dotted drafting paper and one violet ink: it marks where you are, what is in progress, what needs you and
          what is yours to act on. Headings and labels are in the monospace, the text in the serif. Everything below is drawn from the tokens in <code>tokens.css</code> and the components in{' '}
          <code>components/ui</code>; change the theme from the top bar and it follows.
        </p>
      </header>

      <Section id="colour" title="Colour" note="Text is readable (4.5:1) on every surface it sits on, in both themes; the edge of a control is 3:1. A test keeps it so.">
        {COLOURS.map(([group, names]) => (
          <div key={group} className="dz-group">
            <h3>{group}</h3>
            <div className="dz-swatches">
              {names.map((name) => (
                <div key={name} className="dz-swatch">
                  <span className="dz-chip" style={{ background: `var(${name})` }} />
                  <code>{name}</code>
                  <span>{colours[name]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section id="type" title="Type" note="System sans for the interface, a system serif for long-form reading, monospace for code. No web font is loaded.">
        <div className="dz-type">
          {TYPE.map((name) => (
            <div key={name} className="dz-type-row">
              <code>{name}</code>
              <span style={{ fontSize: `var(${name})` }}>The route is the lesson</span>
            </div>
          ))}
          <div className="dz-type-row"><code>--serif</code><span className="dz-serif">Long-form reading sits in a serif that every system already has.</span></div>
          <div className="dz-type-row"><code>--mono</code><span className="dz-mono">GET /api/blogs?tag=postgres</span></div>
        </div>
      </Section>

      <Section id="space" title="Space, radius, shadow" note="Space is on a 4px grid. Control, card and dialog are three different radii, on purpose.">
        <div className="dz-space">
          {SPACE.map((name) => (
            <div key={name} className="dz-space-row"><code>{name}</code><span className="dz-bar" style={{ width: `var(${name})` }} /></div>
          ))}
        </div>
        <div className="dz-boxes">
          {['--r-sm', '--r-md', '--r-lg', '--r-pill'].map((name) => <div key={name} className="dz-box" style={{ borderRadius: `var(${name})` }}><code>{name}</code></div>)}
          {['--shadow-sm', '--shadow-md', '--shadow-lg'].map((name) => <div key={name} className="dz-box dz-shadow" style={{ boxShadow: `var(${name})` }}><code>{name}</code></div>)}
        </div>
      </Section>

      <Section id="buttons" title="Buttons" note="Primary is the one thing to do on a screen. Danger is for what cannot be undone. An icon on its own needs a label.">
        <div className="dz-row">
          <Button variant="primary">Publish</Button>
          <Button>Save draft</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger" icon={<TrashIcon />}>Delete</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button variant="primary" loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>{loading ? 'Saving' : 'Press for loading'}</Button>
          <Button as="a" href="#__design" icon={<PlayIcon />}>As a link</Button>
          <IconButton label="Bookmark"><StarIcon /></IconButton>
          <IconButton label="Delete" variant="secondary"><TrashIcon /></IconButton>
        </div>
      </Section>

      <Section id="fields" title="Fields" note="A real label, a hint tied to the field, and an error that is announced.">
        <div className="dz-grid">
          <TextField label="Title" placeholder="A clear title" hint="Shown in search results and link previews." />
          <TextField label="Title (with an error)" defaultValue="" error="A title is required." />
          <SelectField label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="apis">APIs</option>
            <option value="databases">Databases</option>
            <option value="infra">Infrastructure</option>
          </SelectField>
          <TextField label="Summary" multiline placeholder="Two sentences that make someone want to read it." />
        </div>
      </Section>

      <Section id="chips" title="Chips, badges, avatars">
        <div className="dz-row">
          <Chip>#postgres</Chip>
          <Chip tone="signal">In progress</Chip>
          <Chip tone="danger">Rejected</Chip>
          <Chip onRemove={() => toast.show('Removed')} removeLabel="Remove tag">caching</Chip>
          {['APIs', 'Databases', 'Caching'].map((t) => <ChoiceChip key={t} selected={topic === t.toLowerCase()} onClick={() => setTopic(t.toLowerCase())}>{t}</ChoiceChip>)}
          <Badge>3</Badge><Badge tone="signal">New</Badge>
        </div>
        <div className="dz-row">
          <Avatar name="Ada Okafor" size="sm" /><Avatar name="Ravi Menon" /><Avatar name="Lena Fischer" size="lg" /><Avatar name="Tapan Barik" size="xl" />
        </div>
      </Section>

      <Section id="cards" title="Cards and tabs">
        <div className="dz-grid">
          <Card className="dz-card"><strong>A card</strong><p>A raised surface with a hairline. It lifts under the pointer when it is clickable.</p></Card>
          <Card interactive className="dz-card" onClick={() => toast.show('Opened the card')}><strong>An interactive card</strong><p>Hover it.</p></Card>
        </div>
        <Tabs label="Example tabs" idPrefix="dz" value={tab} onChange={setTab} tabs={[{ id: 'read', label: 'Read' }, { id: 'discuss', label: 'Discuss', badge: 4 }, { id: 'related', label: 'Related' }]} />
        <TabPanel idPrefix="dz" id="read" value={tab}>Arrow keys move between tabs; only the selected tab is in the tab order.</TabPanel>
        <TabPanel idPrefix="dz" id="discuss" value={tab}>Four replies, shown as a badge on the tab.</TabPanel>
        <TabPanel idPrefix="dz" id="related" value={tab}>Related articles would go here.</TabPanel>
      </Section>

      <Section id="overlays" title="Menus, dialogs, toasts" note="Each is keyboard-operable: Escape closes, focus goes in and comes back, the page behind a dialog is inert.">
        <div className="dz-row">
          <Menu trigger={<Button icon={<MenuDotsIcon />}>Open a menu</Button>} align="start">
            <MenuLabel>Article</MenuLabel>
            <MenuItem icon={<StarIcon />} onSelect={() => toast.show('Bookmarked')}>Bookmark</MenuItem>
            <MenuItem icon={<MailIcon />} onSelect={() => toast.show('Link copied')}>Copy link</MenuItem>
            <MenuSeparator />
            <MenuItem tone="danger" icon={<TrashIcon />} onSelect={() => toast.show('Reported', { tone: 'danger' })}>Report</MenuItem>
          </Menu>
          <Button onClick={() => setDialog(true)}>Open a dialog</Button>
          <Button onClick={() => setSheet(true)}>Open a sheet</Button>
          <Button variant="danger" onClick={async () => { const sure = await confirm({ title: 'Delete this draft?', body: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }); toast.show(sure ? 'Deleted' : 'Kept'); }}>Confirm (danger)</Button>
          <Button onClick={() => toast.show('Saved')}>Toast</Button>
          <Button onClick={() => toast.show('Post deleted', { action: { label: 'Undo', onClick: () => toast.show('Restored') } })}>Toast with undo</Button>
          <Button onClick={() => toast.show('Could not save. Check your connection.', { tone: 'danger' })}>Error toast</Button>
        </div>
        <Dialog open={dialog} onClose={() => setDialog(false)} title="Publish this article?" description="It will be public at once. You can unpublish it any time." footer={<><Button onClick={() => setDialog(false)}>Not yet</Button><Button variant="primary" onClick={() => { setDialog(false); toast.show('Published'); }}>Publish</Button></>}>
          <TextField label="Tags" placeholder="postgres, indexing" hint="Up to five, separated by commas." />
        </Dialog>
        <Dialog open={sheet} onClose={() => setSheet(false)} title="A sheet" sheet size="sm" description="On a phone this slides up from the bottom edge.">
          <Button variant="primary" onClick={() => setSheet(false)}>Done</Button>
        </Dialog>
      </Section>

      <Section id="game" title="The learning game" note="Amber is only ever for what the reader has earned (XP, a streak, a badge, a capstone); violet is where they are and what is next; solid ink is what is done. The icons are drawn in the site's own line style, 24 units, round caps: nothing is borrowed from a brand.">
        <div className="dz-row">
          <Crest glyph="server" ratio={0.62} size={92} label="62%"><span className="gm-crest-pct" aria-hidden="true">62%</span></Crest>
          <Crest glyph="trophy" ratio={1} tone="reward" size={92} label="Done" />
          <Crest ratio={0.5} size={52} label="Goal"><span className="gm-goal-n" aria-hidden="true">1/2</span></Crest>
          <span className="gm-xp-chip">+25 XP</span>
          <span className="gm-chip is-here">You are here</span>
          <span className="gm-chip is-boss">Capstone</span>
          <span className="gm-chip is-cleared">Cleared</span>
          <span className="gm-hex" aria-hidden="true">4</span>
        </div>
        <div className="gm-xpbar" style={{ maxWidth: 360 }}><i style={{ width: '58%' }} /></div>
        <h3 className="dz-glyphs-h">Icons ({GLYPH_NAMES.length})</h3>
        <div className="dz-glyphs">
          {GLYPH_NAMES.map((name) => <div key={name} className="dz-glyph"><Glyph name={name} /><code>{name}</code></div>)}
        </div>
      </Section>

      <Section id="loading" title="Loading and empty">
        <div className="dz-grid">
          <Card className="dz-card"><Skeleton lines={4} /><SkeletonBlock height={80} /></Card>
          <Card className="dz-card"><EmptyState icon={<BookIcon />} title="No articles yet" action={<Button variant="primary">Write the first one</Button>}>Be the first to publish here. Your draft is saved as you type.</EmptyState></Card>
        </div>
      </Section>

      <Section id="motion" title="Motion" note="Motion explains where something came from or that it has loaded. It is off for anyone who has asked their system for less.">
        <div className="dz-row">
          <Button onClick={() => setReplay((n) => n + 1)}>Replay</Button>
          {['--dur-quick', '--dur-base', '--dur-slow'].map((name) => (
            <div key={`${name}${replay}`} className="dz-motion"><span style={{ animationDuration: `var(${name})` }} /><code>{name}</code></div>
          ))}
        </div>
      </Section>
    </div>
  );
}
