// The keyboard shortcuts the app answers to (hooks/useKeyboardShortcuts.js), as the "Keyboard shortcuts" dialog lists
// them. [keys, what it does]; "or" separates alternatives. Keep it in step with the hook.
export const SHORTCUTS = [
  [['Ctrl/⌘ K', '/'], 'Search modules, tags and actions'],
  [['J', 'K'], 'Next, previous module'],
  [['D'], 'Mark this module done'],
  [['W'], 'Mark this module in progress'],
  [['T'], 'Cycle the theme (match system, light, dark)'],
  [['B'], 'Show or hide the module tree'],
  [['Esc'], 'Close search, a menu or a dialog']
];

export const SHORTCUTS_COPY = {
  title: 'Keyboard shortcuts',
  note: 'Single keys work when you are not typing in a field.'
};
