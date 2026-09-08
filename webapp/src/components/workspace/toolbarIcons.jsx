// Small icon set for BlockEditor's toolbar — same visual language as the
// app's own icons.jsx (16x16 viewbox, stroke-based), kept local to the
// workspace since these are editor-specific marks (bullet/task/table/image)
// rather than app-wide navigation icons.

export function BulletListIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" {...props}>
      <circle cx="2.2" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <path d="M5.8 4h8.2M5.8 8h8.2M5.8 12h8.2" />
    </svg>
  );
}

export function OrderedListIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" {...props}>
      <path d="M5.8 4h8.2M5.8 8h8.2M5.8 12h8.2" />
      <text x="0.3" y="5.6" fontSize="5" fill="currentColor" stroke="none">1</text>
      <text x="0.3" y="9.6" fontSize="5" fill="currentColor" stroke="none">2</text>
      <text x="0.3" y="13.6" fontSize="5" fill="currentColor" stroke="none">3</text>
    </svg>
  );
}

export function TaskListIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      <rect x="1.8" y="2.2" width="4.4" height="4.4" rx="1" />
      <path d="M3 4.4l0.9 0.9 1.6-1.7" strokeLinecap="round" />
      <rect x="1.8" y="9.4" width="4.4" height="4.4" rx="1" />
      <path d="M7.8 4.4h6.4M7.8 11.6h6.4" strokeLinecap="round" />
    </svg>
  );
}

export function QuoteIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M3 3.5C1.9 3.5 1 4.4 1 5.5v3.3c0 1.1.9 2 2 2h1.1c0 1.4-.8 2.3-2 2.7l.4 1c1.9-.5 3.1-2 3.1-4.2V5.5c0-1.1-.9-2-2-2H3Zm7 0c-1.1 0-2 .9-2 2v3.3c0 1.1.9 2 2 2h1.1c0 1.4-.8 2.3-2 2.7l.4 1c1.9-.5 3.1-2 3.1-4.2V5.5c0-1.1-.9-2-2-2h-.6Z" />
    </svg>
  );
}

export function TableIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1" />
      <path d="M1.8 6.5h12.4M1.8 10.2h12.4M6 2.8v10.4M10 2.8v10.4" />
    </svg>
  );
}

export function ImageIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.2" />
      <circle cx="5.4" cy="6.2" r="1.1" fill="currentColor" stroke="none" />
      <path d="M2.4 11.8l3.6-3.6 2.4 2.4 2-2 3.2 3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  );
}

export function ChevronUpDownIcon({ dir = 'up', ...props }) {
  const d = dir === 'up' ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4';
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={d} />
    </svg>
  );
}
