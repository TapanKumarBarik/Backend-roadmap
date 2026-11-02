import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { SHORTCUTS, SHORTCUTS_COPY } from '../../config/shortcuts.js';

// The keyboard shortcuts, in a dialog (it used to be a browser alert()).
export default function ShortcutsDialog({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={SHORTCUTS_COPY.title}
      description={SHORTCUTS_COPY.note}
      size="sm"
      footer={<Button data-autofocus="" onClick={onClose}>Close</Button>}
    >
      <dl className="shortcut-list">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="shortcut-row">
            <dt>{keys.map((k, i) => <span key={k}>{i > 0 && <span className="shortcut-or"> or </span>}<kbd>{k}</kbd></span>)}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
