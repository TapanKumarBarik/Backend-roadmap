// What a comment is made of, and how code is put in one.

/**
 * What a comment is made of: the words, and the code in them. A line of three backticks (and a language, if there is one) opens a block of code, and the
 * next line of three backticks closes it; a fence that is never closed is just words. Returns [{ type: 'text', text } | { type: 'code', lang, code }].
 */
export function commentParts(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const parts = [];
  let words = [];
  const flush = () => {
    const joined = words.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined.trim()) parts.push({ type: 'text', text: joined });
    words = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^```[ \t]*([\w+#.-]*)[ \t]*$/.exec(lines[i]);
    const close = open ? lines.findIndex((line, at) => at > i && /^```[ \t]*$/.test(line)) : -1;
    if (open && close > i) {
      flush();
      parts.push({ type: 'code', lang: open[1], code: lines.slice(i + 1, close).join('\n') });
      i = close;
    } else {
      words.push(lines[i]);
    }
  }
  flush();
  return parts;
}

/** A piece of code as it is shared in a comment: a line of words, then the code in a fence. */
export const sharedCode = (intro, code, lang = 'python') => `${intro}\n\`\`\`${lang}\n${String(code).replace(/\n+$/, '')}\n\`\`\``;
