// The Backend Roadmap mark: a route from a start ring to an amber destination dot, which is also what a path is.
// The same drawing as public/favicon.svg and public/logo.svg. The tile behind it is .mark's own background, so it
// follows the theme; the dot takes its colour from --mark-dot.
export default function BrandMark({ size = 24 }) {
  return (
    <span className="mark" aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.23 }}>
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <circle cx="7" cy="17.6" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 15.7V13.8Q7 11.3 9.5 11.3H14.5Q17 11.3 17 8.8V8.4" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17" cy="6.3" r="2.5" style={{ fill: 'var(--mark-dot)' }} />
      </svg>
    </span>
  );
}
