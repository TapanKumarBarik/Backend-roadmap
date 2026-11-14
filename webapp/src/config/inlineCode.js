// Escape sequences in a lesson (`\r\n`, `\r\n\r\n`, `\n`, `\t`, `\0`): the characters you cannot see, written the way a program spells them. A lesson on HTTP is full of them. They
// get a class of their own (lib/markdown/controlCode.js and controlText.js add it, styles/global.css draws it) so the page shows one quiet violet token in a sentence, a diagram, a plain
// block and the page outline, instead of grey boxes and raw backslashes. Plain JS, loadable from Node (the build's pre-render step renders lessons).
export const CONTROL_CODE = {
  className: 'code-control',
  // The letters that may follow the backslash: r (carriage return), n (line feed), t (tab), 0 (NUL).
  escapes: 'rnt0',
  // A fence in one of these languages is text, not code (an ASCII diagram, a transcript): it is not coloured as code, and its escape sequences are tinted.
  plainLanguages: ['text', 'txt', 'plaintext']
};
