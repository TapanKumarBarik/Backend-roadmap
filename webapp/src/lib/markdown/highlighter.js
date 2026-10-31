// Syntax highlighting, kept in a module of its own so it is loaded after the page rather than with it: the text of a
// module is readable (and measured) before any colour is added, and the highlighter does not weigh on that first
// load (see enhanceContent.js, the only place that imports this, and only on demand).
//
// The default 'highlight.js' entry point registers all ~190 bundled grammars — the single biggest contributor to
// this app's JS bundle for a feature that only ever needs the languages this curriculum's content actually fences.
// Importing the core and registering only those trims that substantially, with identical output: only a fence whose
// language hljs.getLanguage() recognizes is highlighted, so any tag not registered below (a handful of fences use
// hcl/promql/proto/rego/kusto, none of which highlight.js ships a grammar for even in the full bundle) stays plain,
// unhighlighted code.
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

// Only when an explicit, known language is declared. Bare fences in this curriculum are usually ASCII
// diagrams/tables — auto detection mangles those.
export function highlight(code, lang) {
  if (!lang || !hljs.getLanguage(lang)) return;
  try { hljs.highlightElement(code); } catch { /* highlighting is optional */ }
}
