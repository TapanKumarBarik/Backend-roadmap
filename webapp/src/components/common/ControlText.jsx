import { Fragment } from 'react';
import { splitControlText } from '../../lib/markdown/controlCode.js';
import { CONTROL_CODE } from '../../config/inlineCode.js';

/** A line of plain text (a heading in the page outline) with the escape sequences in it drawn as the control-code token, like the same sequences in the lesson. */
export default function ControlText({ text }) {
  const parts = splitControlText(text);
  if (parts.length === 1 && !parts[0][1]) return text;
  return (
    <>
      {parts.map(([piece, escape], i) => (escape ? <span key={i} className={CONTROL_CODE.className}>{piece}</span> : <Fragment key={i}>{piece}</Fragment>))}
    </>
  );
}
