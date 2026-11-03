// Undo and redo over whole drawings. A history is `{ past, present, future, limit }`; every function gives back a new one. Recording a
// drawing that is the very one already shown records nothing (so a change that changed nothing is not a step to undo), and a new change
// clears what could have been redone.

export function createHistory(present, limit) {
  return { past: [], present, future: [], limit };
}

export function record(history, next) {
  if (next === history.present) return history;
  return { ...history, past: [...history.past, history.present].slice(-history.limit), present: next, future: [] };
}

export function undo(history) {
  if (!history.past.length) return history;
  return { ...history, past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}

export function redo(history) {
  if (!history.future.length) return history;
  return { ...history, past: [...history.past, history.present].slice(-history.limit), present: history.future[0], future: history.future.slice(1) };
}

export const canUndo = (history) => history.past.length > 0;
export const canRedo = (history) => history.future.length > 0;
