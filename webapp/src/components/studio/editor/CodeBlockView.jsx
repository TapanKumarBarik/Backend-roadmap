import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { CODE_LANGUAGES } from '../../../lib/blog/languages.js';

// The block in the editor: the code, and a list to choose its language from. It is drawn like a code block on the page
// (the same .codeblock and .cb-bar styles), so what is written looks like what is read.
export default function CodeBlockView({ node, updateAttributes }) {
  const language = node.attrs.language || '';
  // A language that came in from a fence ("```rust") and is not in the list is still shown, so choosing nothing does not erase it.
  const options = CODE_LANGUAGES.some((l) => l.id === language) ? CODE_LANGUAGES : [...CODE_LANGUAGES, { id: language, label: language }];
  return (
    <NodeViewWrapper className="codeblock studio-code">
      <div className="cb-bar" contentEditable={false}>
        <select className="studio-code__language" aria-label="Code language" value={language} onChange={(e) => updateAttributes({ language: e.target.value || null })}>
          {options.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <pre spellCheck={false}><NodeViewContent as="code" className={language ? `language-${language}` : undefined} /></pre>
    </NodeViewWrapper>
  );
}
