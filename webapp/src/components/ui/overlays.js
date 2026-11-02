// Dialogs and toasts are drawn in #overlays, a sibling of #root (webapp/index.html), not inside the screen that opened
// them. A parent's stacking context cannot then put them under the bottom bar or the sidebar, and the app can be made
// inert as one piece while a dialog is open.
export function overlayRoot() {
  let el = document.getElementById('overlays');
  if (!el) {
    el = document.createElement('div');
    el.id = 'overlays';
    document.body.appendChild(el);
  }
  return el;
}

// Counted, so a dialog opened over another one does not make the app interactive again when the second closes.
let open = 0;
export function setAppInert(on) {
  open = Math.max(0, open + (on ? 1 : -1));
  const app = document.getElementById('root');
  if (app) app.inert = open > 0;
}
