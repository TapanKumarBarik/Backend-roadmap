import { DIAGRAM_LANGUAGE } from '../../../lib/blog/languages.js';

// Everything an author can turn a line into or insert, by one name in one place: the "/" menu offers them, the block
// handle's "turn into" offers the first ones, and the keyboard shortcuts help lists them. `run(chain, ask)` adds to an
// editor command chain; `ask` is for the two that need the author (a picture to choose, an address to paste).
//
// A new diagram starts with a small working example, so the first thing the author sees is what a diagram looks like.
export const DIAGRAM_STARTER = 'flowchart LR\n  Client --> API --> Database';

/**
 * @typedef {{ pickImage: () => void, askVideo: () => void }} Asks
 * @typedef {{ id: string, label: string, hint: string, keywords: string[], turnInto?: boolean, run: (chain: any, ask: Asks) => any }} BlockCommand
 */

/** @type {BlockCommand[]} */
export const BLOCK_COMMANDS = [
  { id: 'paragraph', label: 'Text', hint: 'Plain paragraph', keywords: ['paragraph', 'p', 'plain'], turnInto: true, run: (chain) => chain.setParagraph() },
  { id: 'heading', label: 'Heading', hint: 'A section title', keywords: ['title', 'h2', 'section'], turnInto: true, run: (chain) => chain.setHeading({ level: 2 }) },
  { id: 'subheading', label: 'Subheading', hint: 'A smaller title', keywords: ['h3', 'subsection'], turnInto: true, run: (chain) => chain.setHeading({ level: 3 }) },
  { id: 'bullets', label: 'Bulleted list', hint: 'A list of points', keywords: ['ul', 'list', 'unordered', 'bullets'], turnInto: true, run: (chain) => chain.toggleBulletList() },
  { id: 'numbers', label: 'Numbered list', hint: 'Steps, in order', keywords: ['ol', 'list', 'ordered', 'steps'], turnInto: true, run: (chain) => chain.toggleOrderedList() },
  { id: 'tasks', label: 'To-do list', hint: 'A checklist', keywords: ['todo', 'checklist', 'tasks', 'checkbox'], turnInto: true, run: (chain) => chain.toggleTaskList() },
  { id: 'quote', label: 'Quote', hint: 'Set a passage apart', keywords: ['blockquote', 'cite'], turnInto: true, run: (chain) => chain.toggleBlockquote() },
  { id: 'code', label: 'Code block', hint: 'Code, with a language', keywords: ['pre', 'snippet', 'source'], turnInto: true, run: (chain) => chain.setCodeBlock() },
  { id: 'diagram', label: 'Diagram', hint: 'A Mermaid diagram', keywords: ['mermaid', 'flowchart', 'sequence', 'chart'], run: (chain) => chain.setCodeBlock({ language: DIAGRAM_LANGUAGE }).insertContent(DIAGRAM_STARTER) },
  { id: 'note', label: 'Note', hint: 'A callout for an aside', keywords: ['callout', 'aside', 'info'], run: (chain) => chain.setCallout('note') },
  { id: 'tip', label: 'Tip', hint: 'A callout with advice', keywords: ['callout', 'advice', 'hint'], run: (chain) => chain.setCallout('tip') },
  { id: 'key', label: 'Key idea', hint: 'The one thing to remember', keywords: ['callout', 'important', 'takeaway'], run: (chain) => chain.setCallout('key') },
  { id: 'warning', label: 'Warning', hint: 'A callout for a pitfall', keywords: ['callout', 'pitfall', 'caution', 'danger'], run: (chain) => chain.setCallout('warning') },
  { id: 'table', label: 'Table', hint: 'Rows and columns', keywords: ['grid', 'rows', 'columns'], run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { id: 'image', label: 'Image', hint: 'Upload a picture', keywords: ['picture', 'photo', 'figure', 'upload'], run: (chain, ask) => { ask.pickImage(); return chain; } },
  { id: 'video', label: 'Video', hint: 'A YouTube video', keywords: ['youtube', 'embed', 'movie'], run: (chain, ask) => { ask.askVideo(); return chain; } },
  { id: 'divider', label: 'Divider', hint: 'A line between parts', keywords: ['hr', 'rule', 'separator', 'line'], run: (chain) => chain.setHorizontalRule() }
];

/** The commands that change what a line already is. */
export const TURN_INTO = BLOCK_COMMANDS.filter((command) => command.turnInto);
