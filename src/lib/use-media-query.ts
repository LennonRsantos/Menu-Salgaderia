import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches; false during SSR and hydration. Follows resizes and rotation. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Computers and laptops: a large screen with a mouse or touchpad (leaves out big tablets). */
export const DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
