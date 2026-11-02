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
import { hljsRanges } from './hljsRanges.js';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini'; // also covers the 'toml' alias
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import protobuf from 'highlight.js/lib/languages/protobuf';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml'; // also covers the 'html' alias
import yaml from 'highlight.js/lib/languages/yaml';

/** @type {[string, import('highlight.js').LanguageFn][]} */
const GRAMMARS = [
  ['bash', bash], // also registers the 'sh'/'zsh' aliases
  ['cpp', cpp],
  ['csharp', csharp],
  ['dockerfile', dockerfile],
  ['go', go],
  ['graphql', graphql],
  ['http', http],
  ['ini', ini],
  ['java', java],
  ['javascript', javascript],
  ['json', json],
  ['kotlin', kotlin],
  ['nginx', nginx],
  ['php', php],
  ['plaintext', plaintext],
  ['powershell', powershell],
  ['protobuf', protobuf],
  ['python', python],
  ['ruby', ruby],
  ['rust', rust],
  ['sql', sql],
  ['typescript', typescript],
  ['xml', xml], // also registers the 'html'/'svg'/... aliases
  ['yaml', yaml]
];
GRAMMARS.forEach(([name, lang]) => hljs.registerLanguage(name, lang));

// Only when an explicit, known language is declared. Bare fences in this curriculum are usually ASCII
// diagrams/tables — auto detection mangles those.
export function highlight(code, lang) {
  if (!lang || !hljs.getLanguage(lang)) return;
  try { hljs.highlightElement(code); } catch { /* highlighting is optional */ }
}

/** Whether a language name is one this highlighter colours. */
export const supports = (lang) => !!lang && !!hljs.getLanguage(lang);

/**
 * The coloured parts of `code` as ranges ({ from, to, cls }, offsets into the text), for a place that draws its own text
 * and lays the colours over it (the studio's editor), instead of having elements rewritten as `highlight` does.
 */
export function tokens(code, lang) {
  if (!supports(lang)) return [];
  try { return hljsRanges(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value); } catch { return []; }
}
