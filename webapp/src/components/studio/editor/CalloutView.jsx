import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { CALLOUTS } from '../../../lib/blog/limits.js';

// A callout in the editor: the curriculum's own content block, with its kind to choose in the header.
export default function CalloutView({ node, updateAttributes }) {
  const tone = Object.hasOwn(CALLOUTS, node.attrs.tone) ? node.attrs.tone : 'note';
  return (
    <NodeViewWrapper className={`cblock cblock-${CALLOUTS[tone].cls} studio-callout`}>
      <div className="cblock-h" contentEditable={false}>
        <select className="studio-callout__tone" aria-label="Kind of callout" value={tone} onChange={(e) => updateAttributes({ tone: e.target.value })}>
          {Object.entries(CALLOUTS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <NodeViewContent className="cblock-b" />
    </NodeViewWrapper>
  );
}
