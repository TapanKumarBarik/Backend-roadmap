import { useRef, useState } from 'react';

// Suggests from thread participants only (no global user directory to
// search — see comments.js's parseMentions for why that's also the set a
// mention is actually matched against server-side).
export default function MentionTextarea({ value, onChange, participants, placeholder, className, autoFocus }) {
  const ref = useRef(null);
  const [query, setQuery] = useState(null);

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const match = before.match(/@([A-Za-z0-9 ]{0,24})$/);
    setQuery(match ? match[1] : null);
  }

  function pick(name) {
    const el = ref.current;
    const pos = el.selectionStart;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const idx = before.lastIndexOf('@');
    const newValue = before.slice(0, idx) + '@' + name + ' ' + after;
    onChange(newValue);
    setQuery(null);
    const caretPos = idx + name.length + 2;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caretPos, caretPos); });
  }

  const suggestions = query === null
    ? []
    : participants.filter((p) => p.displayName.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);

  return (
    <div className="mention-wrap">
      <textarea
        ref={ref}
        className={className}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {suggestions.length > 0 && (
        <div className="mention-suggest">
          {suggestions.map((p) => (
            <button key={p.userId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p.displayName)}>
              @{p.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
