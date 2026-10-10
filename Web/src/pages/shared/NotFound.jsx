import { useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getLoginPathFromPath } from '@/utils/auth/roleFromPath';
import { claimLook, releaseLook } from '@/utils/ui/look';
import { Button, Heading, Tag } from '@/components/ui';
import { Grain } from '@/components/ui/Stage';

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
 *
 * A stage screen (design-language PLAN §5.7). It answers ANY unmatched path,
 * so the route map cannot name it: it claims its look while it is mounted.
 */
export default function NotFound() {
  const location = useLocation();
  const loginPath = getLoginPathFromPath(location.pathname);
  const hasRoleContext = loginPath !== '/';

  useLayoutEffect(() => {
    const path = location.pathname;
    claimLook(path, 'prime-time');
    return () => releaseLook(path);
  }, [location.pathname]);

  return (
    // <main>: the page's one landmark (the audit found content outside any).
    <main className="relative isolate min-h-dvh flex items-center px-[var(--pad)] py-16 bg-bg text-fg overflow-hidden">
      <Grain local />
      <div className="relative z-10 w-full max-w-3xl mx-auto grid justify-items-start gap-5">
        <Tag tone="accent">Error 404</Tag>
        <Heading level={1} step="display-xl" sting>Page not found</Heading>
        <p className="type-body text-fg-muted max-w-xl m-0">
          We couldn&apos;t find <span className="text-fg break-all">{location.pathname}</span>.
          The link may be out of date, or the page may have moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <Button as={Link} to="/" size="lg">Go to home</Button>
          {hasRoleContext && (
            <Button as={Link} to={loginPath} variant="line" size="lg">Sign in</Button>
          )}
        </div>
      </div>
    </main>
  );
}
