// The default 'highlight.js' entry point registers all ~190 bundled
// grammars — the single biggest contributor to this app's JS bundle for a
// feature that only ever needs the languages this curriculum's content
// actually fences. Importing the core and registering only those trims that
// substantially, with identical output: enhanceContent already only calls
// hljs on a fence whose language hljs.getLanguage() recognizes, so any tag
// not registered below (a handful of fences use hcl/promql/proto/rego/kusto,
// none of which highlight.js ships a grammar for even in the full bundle)
// falls back to plain, unhighlighted code exactly as it does today.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import graphql from 'highlight.js/lib/languages/graphql';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini'; // also covers the 'toml' alias
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import nginx from 'highlight.js/lib/languages/nginx';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import protobuf from 'highlight.js/lib/languages/protobuf';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml'; // also covers the 'html' alias
import yaml from 'highlight.js/lib/languages/yaml';
import { slugify } from './markdown.js';
import { escapeHtml } from './escapeHtml.js';

[
  ['bash', bash], // also registers the 'sh'/'zsh' aliases
  ['csharp', csharp],
  ['dockerfile', dockerfile],
  ['graphql', graphql],
  ['http', http],
  ['ini', ini],
  ['javascript', javascript],
  ['json', json],
  ['nginx', nginx],
  ['plaintext', plaintext],
  ['powershell', powershell],
  ['protobuf', protobuf],
  ['python', python],
  ['sql', sql],
  ['xml', xml], // also registers the 'html'/'svg'/... aliases
  ['yaml', yaml]
].forEach(([name, lang]) => hljs.registerLanguage(name, lang));

// Post-processes rendered markdown HTML in place: heading ids + permalink
// anchors, code-block wrapping/copy-bar/conditional highlighting. Pure DOM
// mutation only — no listeners attached here. Interactive bits (.anchor,
// .cb-copy, .tab-btn, internal links) are handled by a single delegated
// onClick on ArticleView's container, since the injected HTML persists
// across renders on the same container node just like the vanilla app kept
// one #content element and swapped its innerHTML.
export function enhanceContent(root) {
  const used = {};
  root.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    let id = slugify(h.textContent);
    if (!id) id = 'section';
    if (used[id] !== undefined) { used[id]++; id = id + '-' + used[id]; } else used[id] = 0;
    h.id = id;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + id;
    a.textContent = '#';
    a.dataset.headingAnchor = id;
    h.prepend(a);
  });

  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (pre.parentElement.classList.contains('codeblock')) return;
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const cls = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = cls ? cls.replace('language-', '') : '';

    // Only highlight when an explicit, known language is declared. Bare
    // fences in this curriculum are usually ASCII diagrams/tables — auto
    // detection mangles those.
    if (lang && hljs.getLanguage(lang)) {
      try { hljs.highlightElement(code); } catch { /* highlighting is optional */ }
    }

    const bar = document.createElement('div');
    bar.className = 'cb-bar';
    bar.innerHTML = `<span class="cb-lang">${escapeHtml(lang)}</span><button class="cb-copy" type="button">Copy</button>`;
    wrap.appendChild(bar);
  });
}
