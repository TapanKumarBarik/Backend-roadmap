import { PRIVATE } from '../../config/workspace.js';
import { LockIcon } from './kindIcons.jsx';

// The workspace is private, and a page says so in words (not in a colour or a symbol alone): who can see it, and what it would take
// for anyone else to. Without `kind` it is the sentence for the whole workspace.
export default function PrivateNote({ kind }) {
  return (
    <p className="wsx-private">
      <LockIcon aria-hidden="true" />
      <span><strong>{PRIVATE.label}</strong> {kind ? PRIVATE.byKind[kind] : PRIVATE.workspace}</span>
    </p>
  );
}
