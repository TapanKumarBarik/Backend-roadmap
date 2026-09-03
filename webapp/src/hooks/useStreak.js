import { useEffect, useState } from 'react';
import { fetchStreak } from '../lib/api.js';

export function useStreak(user) {
  const [streak, setStreak] = useState(null);
  useEffect(() => {
    if (!user) { setStreak(null); return; }
    let cancelled = false;
    fetchStreak().then((s) => { if (!cancelled) setStreak(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);
  return streak;
}
