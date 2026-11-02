import { NodeViewWrapper } from '@tiptap/react';
import { videoCardHtml } from '../../../lib/markdown/videoCard.js';
import '../../../styles/video.css';

// A video in the editor: the card a reader will see. It does not play here, and a click on it selects it (so it can be
// moved or deleted) rather than opening YouTube.
export default function VideoView({ node, deleteNode }) {
  return (
    <NodeViewWrapper className="studio-video" contentEditable={false}>
      <div className="studio-video__card" dangerouslySetInnerHTML={{ __html: videoCardHtml(node.attrs.id, '') }} />
      <button type="button" className="studio-video__remove" aria-label="Remove the video" onClick={deleteNode}>Remove</button>
    </NodeViewWrapper>
  );
}
