import { useEffect } from 'react';

/*
 * The landing page is laid out as on a laptop on every device: phones and tablets get the
 * "desktop site" view, scaled to fit their screen, never the narrow mobile layout. Desktop
 * browsers ignore the viewport tag, so laptops are unaffected.
 *
 * 1280 is past the page's own laptop breakpoint (`big`: min-width 1024px in home.css and
 * home/runtime), so the CSS, the pinned scenes and the 3D stage all take their laptop branch.
 * Pinch-zoom stays on.
 *
 * index.html applies the same tag before the first paint on "/", so a phone never lays the hero out
 * narrow and then jumps; keep DESKTOP_VIEWPORT identical to the string there. This hook covers
 * arriving at "/" from inside the app, and puts the normal tag back when leaving.
 */
export const DESKTOP_VIEWPORT = 'width=1280';
const DEVICE_VIEWPORT = 'width=device-width, initial-scale=1.0';

export function useDesktopViewport() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    meta.setAttribute('content', DESKTOP_VIEWPORT);
    return () => meta.setAttribute('content', DEVICE_VIEWPORT);
  }, []);
}
