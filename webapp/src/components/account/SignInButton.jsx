import { GoogleGIcon } from '../icons.jsx';

// The actual point of the React rewrite: a real, labeled "Sign in with
// Google" button — Google's official G glyph kept in full color (the same
// pattern VS Code/Notion/Linear use: a colored provider mark inside an
// otherwise neutral shell) instead of the old bare, unlabeled person icon.
export default function SignInButton({ onClick, title = 'Sign in with Google to sync progress across devices' }) {
  return (
    <button className="gsi-btn" onClick={onClick} title={title}>
      <GoogleGIcon />
      <span>Sign in with Google</span>
    </button>
  );
}
