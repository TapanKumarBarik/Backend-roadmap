import { lazy, Suspense, useState } from 'react';
import { KIND, LIMITS } from '../../lib/workspace/kinds.js';
import { DIAGRAM_MODE } from '../../lib/workspace/diagramShapes.js';
import { emptyModel } from '../../lib/workspace/diagramModel.js';
import { toMermaid } from '../../lib/workspace/diagramMermaid.js';
import { DIAGRAM, SAVE_LABEL } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import { TextField } from '../ui/Field.jsx';
import { TabPanel, Tabs } from '../ui/Tabs.jsx';
import MermaidPreview from '../practice/MermaidPreview.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';
import { useAutosave } from './useAutosave.js';

// The canvas is fetched when a drawing is opened or started: a text diagram never pays for it.
const DiagramEditor = lazy(() => import('./DiagramEditor.jsx'));

const MODE_TABS = [
  { id: DIAGRAM_MODE.text, label: DIAGRAM.mode.text },
  { id: DIAGRAM_MODE.visual, label: DIAGRAM.mode.visual }
];
const ID_PREFIX = 'diagram-mode';

// A saved diagram, either text or drawn.
//
// Text: Mermaid source in a box, drawn live beside it by the same code that draws the diagrams in the lessons. The source is what is saved
// ({ source }); the drawing is made from it each time. This is how every diagram page was before the editor, and it is unchanged.
//
// Visual: boxes and arrows on a canvas (DiagramEditor). What is saved is the drawing ({ source, mode: 'visual', model }); the Mermaid
// source is written from it, shown read only, and can be copied. "Convert to text" keeps that source as the person's own text, from then
// on edited by hand, and drops the drawing.
export default function DiagramPanel({ page, title, onRename, onSaveData, onToast }) {
  const saved = page.data || {};
  const drawn = saved.mode === DIAGRAM_MODE.visual && saved.model ? saved.model : null;
  const [mode, setMode] = useState(drawn ? DIAGRAM_MODE.visual : DIAGRAM_MODE.text);
  const [source, setSource] = useState(saved.source || '');
  const [model, setModel] = useState(drawn);
  const { change, status } = useAutosave(onSaveData);
  const confirm = useConfirm();

  function edit(next) {
    setSource(next);
    change({ source: next });
  }

  function drawing(next) {
    const written = toMermaid(next);
    setModel(next);
    setSource(written);
    change({ source: written, mode: DIAGRAM_MODE.visual, model: next });
  }

  async function switchTo(next) {
    if (next === mode) return;
    if (next === DIAGRAM_MODE.visual) {
      if (source.trim() && !(await confirm({ title: DIAGRAM.startTitle, body: DIAGRAM.startBody, confirmLabel: DIAGRAM.startConfirm, tone: 'danger' }))) return;
      const blank = emptyModel();
      setModel(blank);
      setSource('');
      setMode(DIAGRAM_MODE.visual);
      change({ source: '', mode: DIAGRAM_MODE.visual, model: blank });
      return;
    }
    if (source.trim() && !(await confirm({ title: DIAGRAM.convertTitle, body: DIAGRAM.convertBody, confirmLabel: DIAGRAM.convertConfirm }))) return;
    setModel(null);
    setMode(DIAGRAM_MODE.text);
    change({ source });
    onToast(DIAGRAM.converted);
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      onToast(DIAGRAM.copied);
    } catch {
      onToast(DIAGRAM.copyFailed);
    }
  }

  const visual = mode === DIAGRAM_MODE.visual;
  return (
    <div className="wsx-panel">
      <TitleBar
        kind={KIND.diagram} title={title} onRename={onRename}
        actions={visual ? null : <Button size="sm" onClick={copySource} disabled={!source.trim()}>{DIAGRAM.copy}</Button>}
      />
      <PrivateNote kind={KIND.diagram} />
      <p className="wsx-hint">{visual ? DIAGRAM.leadVisual : DIAGRAM.lead}</p>
      <Tabs label={DIAGRAM.modeLabel} value={mode} onChange={switchTo} tabs={MODE_TABS} idPrefix={ID_PREFIX} />

      <TabPanel id={DIAGRAM_MODE.text} value={mode} idPrefix={ID_PREFIX}>
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
      </TabPanel>

      <TabPanel id={DIAGRAM_MODE.visual} value={mode} idPrefix={ID_PREFIX}>
        <Suspense fallback={<p className="wsx-hint">{DIAGRAM.loadingEditor}</p>}>
          <DiagramEditor model={model} title={title} onChange={drawing} />
        </Suspense>
        <div className="wsx-derived">
          <TextField label={DIAGRAM.derivedLabel} hint={DIAGRAM.derivedHint} multiline readOnly spellCheck={false} value={source} />
          <div className="wsx-sourcebar">
            <Button size="sm" onClick={copySource} disabled={!source.trim()}>{DIAGRAM.copy}</Button>
            <Button size="sm" onClick={() => switchTo(DIAGRAM_MODE.text)}>{DIAGRAM.convert}</Button>
          </div>
          <p className="wsx-save" role="status">{SAVE_LABEL[status]}</p>
        </div>
      </TabPanel>
    </div>
  );
}
