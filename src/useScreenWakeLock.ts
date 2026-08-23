import { useCallback, useEffect, useRef, useState } from 'react';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/** Mantiene acceso lo schermo durante l'allenamento e ripristina il blocco se la pagina torna visibile. */
export function useScreenWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const wanted = useRef(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const [held, setHeld] = useState(false);

  const acquire = useCallback(async () => {
    wanted.current = true;
    if (!supported || document.visibilityState !== 'visible') return false;
    if (sentinel.current && !sentinel.current.released) return true;
    try {
      const lock = await (navigator as NavigatorWithWakeLock).wakeLock!.request('screen');
      sentinel.current = lock;
      setHeld(true);
      lock.addEventListener('release', () => {
        if (sentinel.current === lock) sentinel.current = null;
        setHeld(false);
      });
      return true;
    } catch {
      setHeld(false);
      return false;
    }
  }, [supported]);

  const release = useCallback(async () => {
    wanted.current = false;
    const lock = sentinel.current;
    sentinel.current = null;
    setHeld(false);
    if (lock && !lock.released) {
      try { await lock.release(); } catch { /* il sistema può averlo già rilasciato */ }
    }
  }, []);

  useEffect(() => {
    const restore = () => { if (wanted.current && document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', restore);
    return () => {
      document.removeEventListener('visibilitychange', restore);
      wanted.current = false;
      const lock = sentinel.current;
      sentinel.current = null;
      if (lock && !lock.released) void lock.release().catch(() => undefined);
    };
  }, [acquire]);

  return { acquire, release, held, supported };
}
