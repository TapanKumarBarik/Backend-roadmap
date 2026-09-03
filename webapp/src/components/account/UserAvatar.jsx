import { useState } from 'react';

// Real Google profile photo when available; falls back to an initials
// circle (the pre-rewrite behavior) if there's no picture claim, or the
// image fails to load — never a broken-image icon.
export default function UserAvatar({ user }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (user.email || '?').trim()[0].toUpperCase();
  const showPhoto = user.picture && !imgFailed;
  return (
    <span className="avatar">
      {showPhoto
        ? <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
        : initial}
    </span>
  );
}
