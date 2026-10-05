import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const removeToast = useCallback((id) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message, type = 'success') => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    timers.current.set(id, window.setTimeout(() => removeToast(id), 3500));
  }, [removeToast]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  return useMemo(() => ({ toasts, pushToast, removeToast }), [toasts, pushToast, removeToast]);
}
