import { useState } from 'react';
import { KIND, LIMITS } from '../../lib/workspace/kinds.js';
import { DIAGRAM, SAVE_LABEL } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { TextField } from '../ui/Field.jsx';
import MermaidPreview from '../practice/MermaidPreview.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';
import { useAutosave } from './useAutosave.js';

// A saved diagram: Mermaid source in a box, drawn live beside it by the same code that draws the diagrams in the lessons, kept as a
// page of its own so it can be found and copied again. The source is what is saved; the drawing is made from it each time.
export default function DiagramPanel({ page, title, onRename, onSaveData, onToast }) {
  const [source, setSource] = useState(page.data?.source || '');
  const { change, status } = useAutosave(onSaveData);

  function edit(next) {
    setSource(next);
    change({ source: next });
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      onToast(DIAGRAM.copied);
    } catch {
      onToast(DIAGRAM.copyFailed);
    }
  }

  return (
    <div className="wsx-panel">
      <TitleBar
        kind={KIND.diagram} title={title} onRename={onRename}
        actions={<Button size="sm" onClick={copySource} disabled={!source.trim()}>{DIAGRAM.copy}</Button>}
      />
      <PrivateNote kind={KIND.diagram} />
      <p className="wsx-hint">{DIAGRAM.lead}</p>

      <div className="wsx-diagram">
        <div className="wsx-diagram__source">
          <TextField
            label={DIAGRAM.sourceLabel} multiline spellCheck={false} value={source} maxLength={LIMITS.diagramSourceMax}
            placeholder={DIAGRAM.placeholder} onChange={(e) => edit(e.target.value)}
          />
          {!source.trim() && <Button size="sm" onClick={() => edit(DIAGRAM.example)}>{DIAGRAM.useExample}</Button>}
          <p className="wsx-save" role="status">{SAVE_LABEL[status]}</p>
        </div>
        <div className="wsx-diagram__preview">
          <h4 className="wsx-step__title">{DIAGRAM.previewTitle}</h4>
          <MermaidPreview source={source} label={DIAGRAM.previewLabel(title)} />
        </div>
      </div>
    </div>
  );
}
