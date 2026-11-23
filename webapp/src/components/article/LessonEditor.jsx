import ContentEditor from '../admin/ContentEditor.jsx';
import { ADMIN_EDIT } from '../../config/adminEdit.js';
import '../../styles/admin-edit.css';

// The lesson's own editor, in place of its text: the same editor as Admin, Content, opened on this file. Its own chunk.
export default function LessonEditor({ path, onSaved, onClose }) {
  return (
    <section className="lesson-editor" aria-label={ADMIN_EDIT.heading(path)}>
      <h2 className="lesson-editor__h">{ADMIN_EDIT.heading(path)}</h2>
      <p className="lesson-editor__lead">{ADMIN_EDIT.lead}</p>
      <ContentEditor fixedPath={path} onSaved={onSaved} onClose={onClose} />
    </section>
  );
}
