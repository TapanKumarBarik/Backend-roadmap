import { useCallback, useEffect, useState } from 'react';
import { fetchAuthUser } from '../lib/api.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAuthUser()
      .then((u) => { if (!cancelled) setUser(u); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Deliberately raw navigations, not fetch() — both endpoints are 302
  // redirects into Google's OAuth flow; a fetch() would follow the redirect
  // internally and never actually navigate the browser.
  const login = useCallback(() => {
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.href = `/api/auth/login?redirect=${redirect}`;
  }, []);

  const logout = useCallback(() => {
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.href = `/api/auth/logout?redirect=${redirect}`;
  }, []);

  return { user, loading, login, logout };
}
