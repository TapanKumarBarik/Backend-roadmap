// Inline `code` that is only escape sequences (`\r\n`, `\r\n\r\n`, `\n`, `\t`, `\0`): the characters you cannot see, written the way a program spells them.
// A lesson on HTTP is full of them. They get a class of their own (lib/markdown/controlCode.js adds it, styles/global.css draws it) so the page shows one quiet
// token instead of a grey box that reads as a gap and a button next to a bracket. Plain JS, loadable from Node (the build's pre-render step renders lessons).
export const CONTROL_CODE = {
  className: 'code-control',
  // The letters that may follow the backslash: r (carriage return), n (line feed), t (tab), 0 (NUL).
  escapes: 'rnt0'
};
