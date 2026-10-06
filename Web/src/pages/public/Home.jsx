import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppearanceMenu from '@/components/layout/AppearanceMenu';
import '@fontsource/teko/500.css';
import '@fontsource/teko/600.css';
import '@fontsource-variable/archivo/wdth.css';
import './home/home.css';
import sectionsHtml from './home/sections.html?raw';
import footerHtml from './home/footer.html?raw';
import { HERO_IMAGE } from './home/preload';

/*
 * Mallakhamb India: the landing page.
 *
 * The first screen (masthead, hero and role portal) is plain React: real <Link>s to every login and
 * register route, the app's Light/Dark switch, and nothing that waits for JavaScript beyond React
 * itself. Everything below it is a scroll-driven document: static markup (home/sections.html,
 * home/footer.html) that React renders once and never re-renders, animated by the motion runtime
 * in home/runtime, which loads after the first screen has painted. Pinned scenes, SplitText and the
 * stingers change that markup, so leaving the page puts the pristine copy back, which also keeps
 * StrictMode's double mount honest.
 *
 * The page is a dark "broadcast" design in every appearance. The switch still sits in the masthead
 * so a choice made here carries to the rest of the site.
 */

const ROLES = [
  { key: 'player', name: 'Player', desc: 'Register, join a team, compete.', login: '/player/login', register: '/player/register' },
  { key: 'coach', name: 'Coach', desc: 'Build your team and pay entry fees.', login: '/coach/login', register: '/coach/register' },
  { key: 'judge', name: 'Judge', desc: 'Score on a digital slip from your panel seat.', login: '/judge/login', register: '/judge/register' },
  { key: 'admin', name: 'Admin', desc: 'Run competitions, panels and results.', login: '/admin/login', register: null },
];

const PoleMark = (props) => (
  <svg viewBox="0 0 20 60" aria-hidden="true" {...props}>
    <path d="M10 0c2.8 0 4.5 2.2 4.5 5 0 2.6-1.5 4.6-2.5 5v3h1.5L16 60H4l2.5-47H8v-3C7 9.6 5.5 7.6 5.5 5 5.5 2.2 7.2 0 10 0z" />
  </svg>
);

const Home = () => {
  const pageRef = useRef(null);
  const sectionsRef = useRef(null);
  const footerRef = useRef(null);
  const navigate = useNavigate();

  // The motion runtime: fetched once the browser is idle after the first paint.
  useEffect(() => {
    let destroy = null;
    let dead = false;
    const idle = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb, { timeout: 1200 }) : (cb) => setTimeout(cb, 60);
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => {
      import('./home/runtime')
        .then(({ bootHome }) => { if (!dead && pageRef.current) destroy = bootHome(pageRef.current); })
        .catch((err) => console.error('[home] the motion runtime failed to load; the page stays static.', err));
    });
    return () => {
      dead = true;
      cancel(id);
      if (destroy) destroy();
      if (sectionsRef.current) sectionsRef.current.innerHTML = sectionsHtml;
      if (footerRef.current) footerRef.current.innerHTML = footerHtml;
    };
  }, []);

  // In-app links inside the static markup navigate without a page reload, like a <Link>.
  useEffect(() => {
    const zones = [sectionsRef.current, footerRef.current].filter(Boolean);
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target) return;
      const href = a.getAttribute('href');
      if (!href.startsWith('/') || href.startsWith('//')) return;
      e.preventDefault();
      navigate(href);
    };
    zones.forEach((z) => z.addEventListener('click', onClick));
    return () => zones.forEach((z) => z.removeEventListener('click', onClick));
  }, [navigate]);

  return (
    <div className="mk-home" data-appearance="dark" ref={pageRef}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="grain" aria-hidden="true" />

      <header className="masthead">
        <nav className="masthead__nav" aria-label="Primary">
          <Link className="brand" to="/" aria-label="Mallakhamb India">
            <PoleMark />
            <span>Mallakhamb India</span>
          </Link>
          <ul className="masthead__links">
            <li className="opt"><a href="#name">The sport</a></li>
            <li className="opt"><a href="#apparatus">Apparatus</a></li>
            <li className="opt"><a href="#code">Scoring</a></li>
            <li><Link className="live-link" to="/scores"><span className="dot" aria-hidden="true" />Live scores</Link></li>
            <li className="masthead__appearance"><AppearanceMenu /></li>
          </ul>
        </nav>
      </header>

      <main id="main">
        {/* BLOCK 1: the static portal. No motion; usable at first paint. */}
        <section className="hero" aria-labelledby="hero-title">
          <img
            className="hero__img"
            src={HERO_IMAGE.src}
            srcSet={HERO_IMAGE.srcSet}
            sizes="100vw"
            width="1920"
            height="1440"
            fetchPriority="high"
            decoding="async"
            alt="An athlete holds his body straight out from the top of a pole on a stage, lighting truss and spotlights behind."
          />
          <div className="hero__scrim" aria-hidden="true" />
          <div className="hero__copy">
            <div className="lockup">
              <h1 id="hero-title" className="hero__title"><span className="l1">Mallakhamb</span> <span className="l2">India</span></h1>
              <div className="hero__aside">
                <p className="hero__deva" lang="mr">मल्लखांब</p>
                <p className="hero__tag">Registration, judging and live results for pole, hanging pole and rope Mallakhamb.</p>
              </div>
            </div>
          </div>
          <nav className="portal" aria-labelledby="portal-h">
            <div className="portal__tab">
              <h2 id="portal-h" className="portal__h">Log in or register</h2>
              <p>Pick your role to continue.</p>
            </div>
            {ROLES.map((role) => (
              <div className={`role role--${role.key}`} key={role.key}>
                <h3 className="role__name">{role.name}</h3>
                <p className="role__desc">{role.desc}</p>
                <div className="role__acts">
                  <Link className="btn btn--solid" to={role.login} aria-label={`${role.name} — Log in`}>Log in</Link>
                  {role.register && (
                    <Link className="btn btn--line" to={role.register} aria-label={`${role.name} — Register`}>Register</Link>
                  )}
                </div>
              </div>
            ))}
          </nav>
        </section>

        {/* Below the fold: the scroll-driven document (static markup, animated by home/runtime). */}
        <div className="mk-home__sections" ref={sectionsRef} dangerouslySetInnerHTML={{ __html: sectionsHtml }} />
      </main>

      <div className="mk-home__footer" ref={footerRef} dangerouslySetInnerHTML={{ __html: footerHtml }} />
    </div>
  );
};

export default Home;
