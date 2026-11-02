// The "/" menu of the editor: what has been typed after the slash, and which commands match it. Pure, so the rules can be
// tested without an editor; the commands themselves (what each one does to the document) are in the studio's components.

/**
 * What an author has typed after a "/" that starts a line or follows a space, up to the cursor: { query, length } (length
 * counts the slash), or null when the text before the cursor is not a slash command.
 * @param {string} textBefore  the text of the current line up to the cursor
 */
export function slashQuery(textBefore) {
  const found = /(?:^|\s)\/([A-Za-z0-9+-]{0,24})$/.exec(textBefore);
  return found ? { query: found[1].toLowerCase(), length: found[1].length + 1 } : null;
}

/**
 * The commands that match a query, best first: a label that starts with it, then a keyword that does, then a label or
 * keyword that has it inside. With nothing typed yet, all of them in their own order.
 * @template {{ label: string, keywords?: string[] }} C
 * @param {C[]} commands
 * @param {string} query
 * @returns {C[]}
 */
export function matchCommands(commands, query) {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const rank = (command) => {
    const label = command.label.toLowerCase();
    const keywords = (command.keywords || []).map((k) => k.toLowerCase());
    if (label.startsWith(q)) return 0;
    if (keywords.some((k) => k.startsWith(q))) return 1;
    if (label.includes(q) || keywords.some((k) => k.includes(q))) return 2;
    return -1;
  };
  return commands
    .map((command, index) => ({ command, index, score: rank(command) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}
