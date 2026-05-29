import { useEffect, useLayoutEffect, useRef } from "react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
export { useIsomorphicLayoutEffect };

/**
 * Lightweight ResizeObserver hook that fires on mount and on every resize.
 * Keeps the Konva Stage dimensions in sync with the panel.
 */
export function useResizeObserver(
  ref: React.RefObject<HTMLDivElement | null>,
  onResize: (entry: ResizeObserverEntry) => void,
) {
  const callbackRef = useRef(onResize);
  callbackRef.current = onResize;

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      callbackRef.current(entry);
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [ref]);
}
