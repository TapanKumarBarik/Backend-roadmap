// The lesson's mermaid text as the page hands it to mermaid: the two spellings mermaid rejects, made acceptable. Pure functions, used by
// lib/markdown/mermaidDraw.js when it draws, re-exported by mermaidRender.js, and unit-tested in mermaidRender.test.js.

// Mermaid reads a bare ";" as the end of a statement, so a sequence-diagram message or note that contains one
// ("Accept: text/csv;q=0.5", "gzip_types *;", "Content-Type: x; charset=utf-8") stops the parse and the whole
// diagram is lost. HTTP headers and config lines are full of semicolons, so the text after a line's first colon
// has them written as mermaid's own entity, #59;, which is drawn as ";". One ";" at the very end of a line is
// still a statement terminator and is left alone. Only sequence diagrams: in other kinds a ";" does separate things.
export function escapeSemicolons(source) {
  if (!/^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/.test(source)) return source;
  return source
    .split('\n')
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon < 0) return line;
      const body = line.replace(/;\s*$/, ''); // a single closing ";" is a terminator, not text
      const tail = line.slice(body.length);
      return body.slice(0, colon + 1) + body.slice(colon + 1).replace(/(?<!#\d+);/g, '#59;') + tail;
    })
    .join('\n');
}

// A flowchart edge label is read as plain text until it holds a bracket or brace, and then the parse stops:
// "-->|Write Fast (<1ms)|", "-->|Enqueue: {order_id, user_id}|". Quoting the label is what mermaid asks for and
// draws the same text. Labels already quoted, or holding a "|" of their own, are left as the author wrote them.
export function quoteEdgeLabels(source) {
  if (!/^\s*(?:%%[^\n]*\n\s*)*(?:flowchart|graph)\b/.test(source)) return source;
  return source.replace(/([-=.>ox])\|([^|"\n]*[(){}[\]][^|"\n]*)\|/g, '$1|"$2"|');
}

// What the page hands to mermaid: the lesson's own text, with the two spellings mermaid rejects made acceptable.
export const prepareSource = (source) => quoteEdgeLabels(escapeSemicolons(source));
