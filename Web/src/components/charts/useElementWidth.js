import { useEffect, useRef, useState } from 'react';

/**
 * The rendered width of an element, kept current with a ResizeObserver, so an
 * SVG chart draws at its real size (crisp text, no sideways scroll) on a phone
 * and a desktop alike.
 */
export default function useElementWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(Math.max(240, w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
