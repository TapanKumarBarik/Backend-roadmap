// One line of "that didn't work" next to the thing that failed: a post, a vote, a delete, a save. Announced to
// screen readers when it appears. Renders nothing when there is no message, so callers need no condition.
// Pass the text through friendlyMessage(err) (lib/errors.js) rather than err.message.
export default function ErrorText({ children, small = false }) {
  if (!children) return null;
  return <p role="alert" className={'form-error' + (small ? ' small' : '')}>{children}</p>;
}
