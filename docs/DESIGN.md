# Design system

The look of the site is one system, called **Blueprint**: hairlines on dotted drafting paper and **one violet ink**, which marks where you are, what is in progress, what needs you and what is yours to act on (a link, a page's own title, the selected row, a primary button). Headings and labels are set in the monospace and in capitals (`--display`), the text of a lesson in the serif; `styles/voice.css` is that layer over the tokens, and deleting it (and its import in `main.jsx`) takes the voice off without touching the colours. It is drawn from design tokens and a small set of shared components, and `/#__design` shows all of them, from the real code, in whichever theme you are using.

This page is for whoever changes the interface. The plan it belongs to is [MODERNIZATION.md](MODERNIZATION.md).

## Tokens

Every colour, size, space, radius, shadow, layer and timing is a CSS custom property in [`webapp/src/styles/tokens.css`](../webapp/src/styles/tokens.css). A screen does not invent one.

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--bg` (paper), `--bg-sunken` (wells, inputs), `--bg-raised` (cards, menus, dialogs) | `--bg-raised` must never equal `--bg`, or nothing can be lifted off the page |
| Text | `--fg`, `--fg-muted`, `--fg-subtle` | all three are at least 4.5:1 on every surface, in both themes |
| Lines | `--border-subtle`, `--border` (hairlines: decoration), `--border-strong` (the edge of a field or control: 3:1) | |
| State | `--signal`, `--signal-bg`, `--signal-line`, `--on-signal`, `--done`, `--danger` | `--on-signal` is the text colour on a solid signal fill |
| Links | `--link`, `--link-visited` | violet, like the rest of the ink; visited links are a plum |
| Type | `--sans`, `--serif`, `--mono`; `--text-2xs` to `--text-4xl`; `--leading-*`; `--weight-*` | the serif is for long-form reading and is a system stack: no web font is loaded |
| Space | `--space-1` to `--space-16` | a 4px grid |
| Shape | `--r-sm`, `--r-md`, `--r-lg`, `--r-pill`; `--shadow-sm`, `--shadow-md`, `--shadow-lg` | control, card and dialog are three different radii, on purpose |
| Layers | `--z-rail` < `--z-topbar` < `--z-drawer` < `--z-menu` < `--z-dialog` < `--z-toast` < `--z-palette` | a new overlay takes a place in this list, not a number |
| Motion | `--ease-out`, `--ease-in-out`, `--dur-quick` (120ms), `--dur-base` (240ms), `--dur-slow` (600ms) | what motion is for is at the top of `motion.css` |
| Focus and scrim | `--focus-ring`, `--scrim` | |

The dark theme is written twice (once for "follow the system", once for the explicit choice). `webapp/src/styles/tokens.test.js` fails if the two copies differ, if any text colour drops under 4.5:1 on a surface, or if the edge of a control drops under 3:1. Run it after changing a colour: `npm test`.

## Components

In `webapp/src/components/ui/`, styled by `webapp/src/styles/ui.css` (every rule starts with `:is(#root, #overlays)`, which is what lets it win over the older screen styles that address elements by id without anyone raising a specificity by hand).

| Component | Use it for | What it does for you |
|---|---|---|
| `Button`, `IconButton` | every action. `variant` says how much it matters: primary (the one thing to do), secondary, ghost, danger | loading state, `as="a"` for links, a required accessible name on icon buttons |
| `TextField`, `SelectField` | every form field | a real label, a hint and an error tied to the field, the error announced |
| `Chip`, `ChoiceChip`, `Badge` | tags, statuses, filters (a chip that is a switch), counts | pressed state announced |
| `Avatar` | a person | picture or initials |
| `Card` | a raised surface | lifts when interactive |
| `Tabs`, `TabPanel` | switching views of the same thing | arrow keys, Home, End, one tab in the tab order |
| `Menu`, `MenuItem` | a list of actions from a button | focus in and back, arrow keys, type-ahead, Escape, click outside |
| `Dialog`, `useConfirm` | anything that needs an answer; `useConfirm()` replaces `window.confirm` | drawn in `#overlays`, the app is inert behind it, focus trapped and restored, Escape |
| `useToast` | what just happened | polite live region (errors at once), pauses on hover, leaves by itself |
| `Skeleton`, `EmptyState` | loading, and nothing here yet | |

```jsx
const confirm = useConfirm();
if (!(await confirm({ title: 'Delete this post?', body: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;

const toast = useToast();
toast.show('Post deleted', { action: { label: 'Undo', onClick: restore } });
```

Dialogs and toasts are drawn in `#overlays`, a sibling of `#root`, so no parent's stacking context can put them under anything; `ConfirmProvider` and `ToastProvider` are mounted in `main.jsx`.

## Rules

- **Tokens, not literals.** No hex colour, pixel space or z-index in new CSS. If something is missing, add a token (and a line here).
- **Keyboard first.** Everything reachable by mouse is reachable by keyboard. The focus ring is global (`ui.css`) and drawn only for the keyboard.
- **Text is readable.** Do not put `--fg-subtle` on a tinted fill without checking; the tokens test only covers the three surfaces.
- **Motion is optional.** Use the timing tokens. `motion.css` turns every animation and transition off for anyone who asked their system for less motion, so never rely on an animation to deliver information.
- **A screen is a `<main>`** that arrives with a short fade (`.screen-enter`) and starts at the top.
- **No browser pop-ups.** `confirm()` and `alert()` are replaced by `useConfirm()` and `Dialog`.

## Adding a component

1. `components/ui/Name.jsx` and its rules in `ui.css` (prefix `ui-`, scoped as above, tokens only).
2. Name, role, state and keyboard behaviour done by construction, not left to the caller.
3. Draw it in `components/design/DesignView.jsx` and describe it in the table above.
4. If it has behaviour (focus, keys, announcements), a test in `tests/e2e/design.e2e.mjs`.
