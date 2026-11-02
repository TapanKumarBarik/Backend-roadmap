import { useEffect, useState } from 'react';

// Keeps something on the page while it animates out. `mounted` says whether to render it at all; `state` is "open" or
// "closed" and goes on the element (data-state) for the CSS to transition between. Opening mounts it one frame before
// it turns "open", so the transition has a starting point to run from.
export function useMountTransition(open, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState(open ? 'open' : 'closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setState('open')); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    setState('closed');
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, state };
}
