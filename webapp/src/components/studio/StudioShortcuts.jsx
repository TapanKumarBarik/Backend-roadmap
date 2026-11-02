import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { STUDIO_SHORTCUTS } from '../../config/studio.js';

// The keys and the markdown shortcuts the studio answers to, in a dialog (config/studio.js has the list).
export default function StudioShortcuts({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Writing shortcuts" description="Type markdown and it turns into formatting as you write." size="sm" footer={<Button data-autofocus="" onClick={onClose}>Close</Button>}>
      {Object.entries(STUDIO_SHORTCUTS).map(([group, rows]) => (
        <section key={group} aria-label={group}>
          <h3 className="studio-shortcuts__group">{group}</h3>
          <dl className="shortcut-list">
            {rows.map(([keys, what]) => (
              <div key={what} className="shortcut-row">
                <dt>{keys.map((k, i) => <span key={k}>{i > 0 && <span className="shortcut-or"> or </span>}<kbd>{k}</kbd></span>)}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}
