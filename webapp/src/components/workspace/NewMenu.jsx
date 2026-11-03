import { KIND } from '../../lib/workspace/kinds.js';
import { NEW_MENU } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { Menu, MenuItem } from '../ui/Menu.jsx';
import { KindIcon } from './kindIcons.jsx';

// "Add…": the kinds of page there are besides a plain one (which has a button of its own). `onPick` is given the kind.
export default function NewMenu({ onPick, label = NEW_MENU.button, align = 'start', variant = 'secondary' }) {
  return (
    <Menu align={align} trigger={<Button variant={variant} size="sm">{label}</Button>}>
      {NEW_MENU.kinds.map((kind) => (
        <MenuItem key={kind} icon={<KindIcon kind={kind} />} onSelect={() => onPick(kind)}>{NEW_MENU.item[kind]}</MenuItem>
      ))}
      {/* A plain page is the first thing anyone wants, so it is always in the list too (the tree also has a button for it). */}
      <MenuItem icon={<KindIcon kind={KIND.page} />} onSelect={() => onPick(KIND.page)}>{NEW_MENU.item[KIND.page]}</MenuItem>
    </Menu>
  );
}
