import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((text) => {
    clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = setTimeout(() => setMessage(null), 2100);
  }, []);

  return { message, show };
}
