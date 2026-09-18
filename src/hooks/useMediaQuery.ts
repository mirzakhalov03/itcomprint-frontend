import { useCallback, useSyncExternalStore } from 'react';

/** Live CSS media-query match; re-renders only when the result flips. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Tailwind's `lg`: the split-view kiosk. Below it the kiosk switches to its handheld layout. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
