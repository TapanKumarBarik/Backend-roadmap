import { DIAGRAM_CANVAS } from '../../config/diagramEditor.js';

// Saving the canvas as a picture. The picture is what is on the screen: the live drawing is copied, every colour it takes from a CSS
// variable is written out as the colour it is right now (a standalone file has no variables), and what only helps editing (the grid, the
// selection ring, the handles, the invisible wide lines arrows are grabbed by) is left out. Nothing is sent anywhere.
const NS = 'http://www.w3.org/2000/svg';
const COPIED = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order'];
const SKIP = '[data-export="skip"]';

function inlineStyles(from, to) {
  const computed = getComputedStyle(from);
  to.setAttribute('style', COPIED.map((name) => `${name}:${computed.getPropertyValue(name)}`).join(';'));
  for (let i = 0; i < from.children.length; i++) inlineStyles(from.children[i], to.children[i]);
}

/** `{ svg, width, height }`: a standalone copy of the drawing in `live` (the canvas's svg), fitted to its content with a margin. */
export function buildSvg(live, contentSelector) {
  const copy = live.cloneNode(true);
  inlineStyles(live, copy);
  copy.querySelectorAll(SKIP).forEach((el) => el.remove());
  const content = copy.querySelector(contentSelector);
  content.removeAttribute('transform');

  // The content is measured where it can be laid out, off screen.
  const stage = document.createElementNS(NS, 'svg');
  stage.setAttribute('style', 'position:fixed;left:-99999px;top:0;visibility:hidden');
  stage.appendChild(copy);
  document.body.appendChild(stage);
  const box = content.getBBox();
  stage.remove();

  const margin = DIAGRAM_CANVAS.exportMargin;
  const width = Math.ceil(box.width + 2 * margin);
  const height = Math.ceil(box.height + 2 * margin);
  copy.setAttribute('xmlns', NS);
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.setAttribute('viewBox', `${box.x - margin} ${box.y - margin} ${width} ${height}`);
  copy.removeAttribute('class');
  copy.removeAttribute('tabindex');
  copy.removeAttribute('role');
  copy.removeAttribute('aria-describedby');
  copy.setAttribute('style', '');

  const background = document.createElementNS(NS, 'rect');
  background.setAttribute('x', String(box.x - margin));
  background.setAttribute('y', String(box.y - margin));
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', getComputedStyle(live).backgroundColor);
  copy.insertBefore(background, content);
  return { svg: new XMLSerializer().serializeToString(copy), width, height };
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadSvg(live, contentSelector, name) {
  save(new Blob([buildSvg(live, contentSelector).svg], { type: 'image/svg+xml' }), name);
}

/** The picture as a PNG, drawn `pngScale` times larger than the SVG so it stays sharp. Resolves when the download has started. */
export function downloadPng(live, contentSelector, name) {
  const { svg, width, height } = buildSvg(live, contentSelector);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * DIAGRAM_CANVAS.pngScale;
      canvas.height = height * DIAGRAM_CANVAS.pngScale;
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('png')); return; }
        save(blob, name);
        resolve();
      }, 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('png')); };
    image.src = url;
  });
}
