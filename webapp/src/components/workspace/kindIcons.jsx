import { KIND } from '../../lib/workspace/kinds.js';
import { WorkspaceIcon } from '../common/icons.jsx';

// One mark per kind of page, in the same stroke style as the editor's toolbar icons. They are decorative: the kind is always
// said in words too (KindIcon is aria-hidden; the row and the panel carry the kind's name).
const stroke = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round', strokeLinecap: 'round' };

export function LockIcon(props) {
  return (
    <svg {...stroke} {...props}>
      <rect x="3" y="7" width="10" height="7" rx="1.4" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
    </svg>
  );
}

export function FolderIcon(props) {
  return (
    <svg {...stroke} {...props}>
      <path d="M1.8 4.6c0-.6.5-1.1 1.1-1.1h3l1.4 1.6h5.8c.6 0 1.1.5 1.1 1.1v5.6c0 .6-.5 1.1-1.1 1.1H2.9c-.6 0-1.1-.5-1.1-1.1V4.6Z" />
    </svg>
  );
}

export function PlanIcon(props) {
  return (
    <svg {...stroke} {...props}>
      <path d="M3 2.5v11" />
      <path d="M3 3h8.2l-1.6 2.6L11.2 8H3" />
      <path d="M5.5 11.2l1.3 1.3 2.4-2.6" />
    </svg>
  );
}

export function RevisionIcon(props) {
  return (
    <svg {...stroke} {...props}>
      <path d="M13.2 7.2A5.2 5.2 0 0 0 3.4 5.4" />
      <path d="M3.2 2.6v3h3" />
      <path d="M2.8 8.8a5.2 5.2 0 0 0 9.8 1.8" />
      <path d="M12.8 13.4v-3h-3" />
    </svg>
  );
}

export function DiagramIcon(props) {
  return (
    <svg {...stroke} {...props}>
      <rect x="1.8" y="2.6" width="4.6" height="3.4" rx=".8" />
      <rect x="9.6" y="10" width="4.6" height="3.4" rx=".8" />
      <rect x="9.6" y="2.6" width="4.6" height="3.4" rx=".8" />
      <path d="M6.4 4.3h3.2M4.1 6v5.7h5.5" />
    </svg>
  );
}

const ICONS = { [KIND.folder]: FolderIcon, [KIND.plan]: PlanIcon, [KIND.revision]: RevisionIcon, [KIND.diagram]: DiagramIcon, [KIND.page]: WorkspaceIcon };

export function KindIcon({ kind, ...rest }) {
  const Icon = ICONS[kind] || WorkspaceIcon;
  return <Icon aria-hidden="true" {...rest} />;
}
