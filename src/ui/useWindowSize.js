/**
 * Window-size hook (spike: useWindowSize is absent in ink@6.8.0).
 * Falls back to the classic floor (40×16) when stdout has no metrics.
 */
import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  process.on('SIGWINCH', callback);
  return () => process.off('SIGWINCH', callback);
}

function getSnapshot() {
  return `${process.stdout.columns || 100}x${process.stdout.rows || 30}`;
}

export function useWindowSize() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [w, h] = snapshot.split('x').map(Number);
  return { w: Math.max(40, w), h: Math.max(16, h) };
}
