import { useCallback, useEffect, useRef, useState } from 'react';

// "Fetch when the screen opens, hold the data, hold the error": the pattern most data screens wrote out by
// hand. What it adds is the part they all lacked, a `reload` so a failure can be retried without leaving the
// screen. The failure is kept as the error OBJECT (status and all), so the UI can say what really happened
// (components/common/LoadError.jsx) instead of printing a string.
//
//   const { data, setData, error, reload } = useLoader(fetchQuestions);
//   const { data } = useLoader(fetchAllNotes, [], { enabled: !!user });
//
// `data` is null until the first success. A failed reload keeps the data that was already there, and only the
// newest request may write state, so a slow old answer can never overwrite a newer one.
export function useLoader(fetcher, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const newest = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true; // set again on every mount: React's dev double-mount runs cleanup in between
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(() => {
    const mine = ++newest.current;
    const current = () => alive.current && mine === newest.current;
    return Promise.resolve()
      .then(() => fetcherRef.current())
      .then(
        (result) => { if (current()) { setData(result); setError(null); } },
        (err) => { if (current()) setError(err); }
      );
  }, []);

  useEffect(() => {
    if (enabled) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reload, ...deps]);

  return { data, setData, error, reload };
}
