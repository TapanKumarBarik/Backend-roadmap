import { parseMarkdown, stepFence } from './math.js';
import { escapeHtml } from './escapeHtml.js';
import { stash } from './htmlStash.js';

const OPEN = /^\s*\{\{tabs\}\}\s*$/;
const CLOSE = /^\s*\{\{\/tabs\}\}\s*$/;
const CAROUSEL_OPEN = /^ {0,3}(`{4,}|~{4,})carousel\s*$/;

const LANG_LABELS = {
  go: 'Go', golang: 'Go',
  typescript: 'TypeScript', ts: 'TypeScript',
  javascript: 'JavaScript', js: 'JavaScript',
  node: 'Node.js',
  python: 'Python', py: 'Python',
  csharp: 'C#', cs: 'C#', 'c#': 'C#',
  java: 'Java',
  rust: 'Rust', rs: 'Rust',
  bash: 'Bash', sh: 'Bash', zsh: 'Bash', shell: 'Shell',
  dockerfile: 'Dockerfile', docker: 'Dockerfile',
  json: 'JSON', yaml: 'YAML', yml: 'YAML',
  sql: 'SQL', http: 'HTTP', graphql: 'GraphQL',
  proto: 'Protobuf', protobuf: 'Protobuf',
  cpp: 'C++', c: 'C', powershell: 'PowerShell', ps1: 'PowerShell'
};

function canonicalLang(raw) {
  const clean = raw.trim();
  return LANG_LABELS[clean.toLowerCase()] || clean;
}

function renderTabGroup(items, gid) {
  let buttons = '';
  let panes = '';
  items.forEach(({ label, body }, i) => {
    const first = i === 0;
    const escLabel = escapeHtml(label);
    buttons += `<button class="tab-btn${first ? ' active' : ''}" data-lang="${escLabel}">${escLabel}</button>`;
    panes += `<div class="tab-pane" data-lang="${escLabel}" style="display:${first ? 'block' : 'none'}">${parseMarkdown(body.trim())}</div>`;
  });
  return `<div class="tabs" data-group="${gid}"><div class="tab-buttons">${buttons}</div><div class="tab-panes">${panes}</div></div>`;
}

function buildGroup(body, gid) {
  const parts = body.split(/\{\{tab\s+([^}]+)\}\}/);
  const items = [];
  for (let i = 1; i < parts.length; i += 2) {
    items.push({ label: parts[i].trim(), body: parts[i + 1] || '' });
  }
  return renderTabGroup(items, gid);
}

function splitCarouselSlides(lines) {
  const slides = [];
  let cur = [];
  const fence = { char: '', len: 0 };

  for (const line of lines) {
    if (!fence.char && /^\s*<!--\s*slide\s*-->\s*$/.test(line)) {
      slides.push(cur.join('\n').trim());
      cur = [];
      continue;
    }
    stepFence(line, fence);
    cur.push(line);
  }
  slides.push(cur.join('\n').trim());
  return slides.filter(Boolean);
}

function slideMeta(slide, idx) {
  const lines = slide.split('\n');
  const first = lines[0]?.trim() || '';

  const hMatch = /^#{1,6}\s+(.+)$/.exec(first);
  if (hMatch) {
    const rawHeading = hMatch[1].trim();
    const headWord = rawHeading.split(/[\s:(\u2014\u2013-]/, 1)[0];
    const mapped = LANG_LABELS[headWord.toLowerCase()];
    if (mapped) {
      // Drop bare language heading like "### Python"; keep descriptive headings (e.g. "### Go — Validator").
      const rest = rawHeading.slice(headWord.length).trim();
      return { base: mapped, body: rest ? slide : lines.slice(1).join('\n').trim(), hint: null };
    }
    return { base: rawHeading.replace(/`/g, '').trim() || `Tab ${idx + 1}`, body: slide, hint: null };
  }

  const fMatch = /^ {0,3}(?:`{3,}|~{3,})([A-Za-z0-9_+#.-]+)/.exec(first);
  if (fMatch) {
    const cMatch = /^#\s*(Dockerfile\.[A-Za-z0-9_-]+)/i.exec(lines[1]?.trim() || '');
    return { base: canonicalLang(fMatch[1]), body: slide, hint: cMatch ? cMatch[1] : null };
  }

  return { base: `Tab ${idx + 1}`, body: slide, hint: null };
}

function buildCarouselGroup(lines, gid) {
  const slides = splitCarouselSlides(lines);
  if (!slides.length) return '';
  const meta = slides.map(slideMeta);
  const counts = {};
  for (const item of meta) counts[item.base] = (counts[item.base] || 0) + 1;
  const seen = {};
  return renderTabGroup(meta.map((item) => {
    let label = item.base;
    if (counts[label] > 1) {
      label = item.hint || `${label} (${seen[label] = (seen[label] || 0) + 1})`;
    }
    return { label, body: item.body };
  }), gid);
}

// {{tabs}} {{tab Label}} …md… {{/tabs}} AND ````carousel … <!-- slide --> … ```` -> tab groups.
//
// A line scan rather than one regex over the whole document: ignores fences outside groups and stashes
// generated HTML so blank lines inside code panes are not split by marked. See htmlStash.js.
export function renderTabs(md, store) {
  const lines = md.split('\n');
  const out = [];
  const fence = { char: '', len: 0 };
  let n = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!fence.char) {
      const cOpen = CAROUSEL_OPEN.exec(line);
      if (cOpen || OPEN.test(line)) {
        const closeRe = cOpen ? new RegExp(`^ {0,3}${cOpen[1][0]}{${cOpen[1].length},}\\s*$`) : CLOSE;
        const body = [];
        let j = i + 1;
        for (; j < lines.length && !closeRe.test(lines[j]); j++) body.push(lines[j]);
        if (j >= lines.length) { out.push(line); continue; }
        const rendered = cOpen ? buildCarouselGroup(body, 'tabgroup-' + n++) : buildGroup(body.join('\n'), 'tabgroup-' + n++);
        out.push(rendered ? stash(store, rendered) : '');
        i = j;
        continue;
      }
    }

    stepFence(line, fence);
    out.push(line);
  }

  return out.join('\n');
}
