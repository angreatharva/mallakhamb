import { Link, useLocation } from 'react-router-dom';
import { getLoginPathFromPath } from '@/utils/auth/roleFromPath';

/**
 * 404 view.
 *
 * The catch-all route used to be `<Navigate to="/" replace />`, which sent any
 * unmatched URL to the home page with no explanation. A mistyped or stale link
 * looked identical to a successful navigation, and — because the redirect used
 * `replace` — the browser Back button could not return the user to where they
 * came from. A deep link that had simply gone stale was indistinguishable from
 * one that had worked.
 *
 * The role prefix is still honoured where there is one: a bad `/judge/*` URL
 * offers the judge sign-in rather than the public home page, so a judge who
 * follows a dead link at a venue lands somewhere useful.
 */
export default function NotFound() {
  const location = useLocation();
  const loginPath = getLoginPathFromPath(location.pathname);
  const hasRoleContext = loginPath !== '/';

  return (
    // <main>: the page's one landmark (the audit found content outside any).
    // Colours from the appearance tokens — identical in dark, legible in light.
    <main
      className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: 'rgb(var(--bg))' }}
    >
      <div className="text-center max-w-md">
        <p
          className="text-7xl font-black tracking-tight mb-2"
          style={{ color: 'rgb(var(--ink) / 0.12)' }}
        >
          404
        </p>
        <h1 className="text-xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-sm text-fg-muted mb-8">
          We couldn&apos;t find <span className="text-white/70">{location.pathname}</span>.
          The link may be out of date, or the page may have moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px] flex items-center justify-center transition-colors"
            style={{
              background: 'rgb(var(--ink) / 0.08)',
              border: '1px solid rgb(var(--ink) / 0.14)',
            }}
          >
            Go to home
          </Link>

          {hasRoleContext && (
            <Link
              to={loginPath}
              className="px-5 py-2.5 rounded-xl text-sm font-bold min-h-[44px] flex items-center justify-center text-white/70 hover:text-white transition-colors"
              style={{ border: '1px solid rgb(var(--ink) / 0.10)' }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
