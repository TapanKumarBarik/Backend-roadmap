import { splitControlText } from './controlCode.js';
import { CONTROL_CODE } from '../../config/inlineCode.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Draws every escape sequence that stands on its own under `root` (a plain code block, a drawn diagram) in the control-code style, by cutting the text node it sits in and
 * putting a marked element around it. The text is the same text afterwards, so copying a block still copies the backslashes. Inside an SVG the mark is a tspan.
 */
export function tintControlText(root) {
  const found = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parts = splitControlText(node.nodeValue || '');
    if (parts.some(([, escape]) => escape) && !node.parentElement?.closest(`.${CONTROL_CODE.className}`)) found.push([node, parts]);
  }
  for (const [node, parts] of found) {
    const inSvg = node.parentNode?.namespaceURI === SVG;
    const fragment = document.createDocumentFragment();
    for (const [piece, escape] of parts) {
      if (!escape) {
        fragment.append(piece);
        continue;
      }
      const mark = inSvg ? document.createElementNS(SVG, 'tspan') : document.createElement('span');
      mark.setAttribute('class', CONTROL_CODE.className);
      mark.textContent = piece;
      fragment.append(mark);
    }
    node.replaceWith(fragment);
  }
}
