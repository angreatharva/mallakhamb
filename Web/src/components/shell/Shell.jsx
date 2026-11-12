import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Mail, Menu as MenuIcon, UserRound } from 'lucide-react';
import '@/styles/look-fonts';
import AppearanceMenu from '@/components/layout/AppearanceMenu';
import { Button, Dialog, Heading, IconButton, Menu, Tag } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { Wordmark } from '@/components/brand/Brand';

/**
 * The working-screen shell (design-language PLAN §7, Phase 4.1). Built now,
 * adopted screen by screen as each rollout wave converts its routes.
 */

const ROLE_LABEL = { player: 'Player', coach: 'Coach', admin: 'Admin', judge: 'Judge', superadmin: 'Super Admin' };

/** The role, shown as a tag: text plus the ident colour — never colour alone (§8.15). */
export const RoleIdent = ({ role, className = '' }) =>
  (ROLE_LABEL[role] ? <Tag tone="ident" className={className}>{ROLE_LABEL[role]}</Tag> : null);
RoleIdent.propTypes = { role: PropTypes.string, className: PropTypes.string };

/** Where each item of the account menu goes, under a role's profile page. */
export const accountMenuTargets = (profileTo) => [
  { label: 'My profile', to: profileTo, icon: UserRound },
  { label: 'Change password', to: `${profileTo}#password`, icon: KeyRound },
  { label: 'Update email', to: `${profileTo}#email`, icon: Mail },
];

/**
 * The top-right account menu: the profile page and its two sections that
 * people look for by name. Logout stays its own button beside it — the one
 * control nobody should have to open a menu to find.
 */
export const AccountMenu = ({ profileTo }) => {
  const navigate = useNavigate();
  return (
    <Menu
      label="Account"
      buttonLabel={<span className="shell-account__label">Account</span>}
      buttonVariant="ghost"
      icon={UserRound}
      items={accountMenuTargets(profileTo).map(({ label, to, icon }) => ({ label, icon, onSelect: () => navigate(to) }))}
    />
  );
};
AccountMenu.propTypes = { profileTo: PropTypes.string.isRequired };

/** Light/Dark, Account, Logout — the account cluster every signed-in screen carries. "Logout", the site's word for it (the e2e flows find it by that name). */
export const AccountControls = ({ onLogout, profileTo = null, appearance = true, drawer = false, className = '' }) => (
  // Its own class, not Tailwind's `flex`: a utility here would beat the shell's
  // own breakpoint rules (utilities win ties by design), and the header hides
  // this cluster on phones.
  <div className={cx('shell-account', className)}>
    {appearance && <AppearanceMenu />}
    {/* In the phone drawer the items are plain links: a menu inside a sheet is one layer too many. */}
    {profileTo && !drawer && <AccountMenu profileTo={profileTo} />}
    {profileTo && drawer && (
      <nav aria-label="Account" className="shell-drawer__account-links">
        {accountMenuTargets(profileTo).map(({ label, to, icon: Icon }) => (
          <Link key={label} to={to} className="shell-drawer__account-link type-body-s">
            <Icon aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    )}
    {onLogout && <Button variant="line" size="sm" icon={LogOut} onClick={onLogout}>Logout</Button>}
  </div>
);
AccountControls.propTypes = {
  onLogout: PropTypes.func, profileTo: PropTypes.string, appearance: PropTypes.bool, drawer: PropTypes.bool, className: PropTypes.string,
};

/**
 * Tabs that are links: one per route. The current page is marked by
 * NavLink (`aria-current="page"`) and carries the accent bar.
 *   items: [{ to: '/admin/dashboard', label: 'Overview', end: true }, …]
 */
export const TabNav = ({ items, label, vertical = false, onNavigate = null, className = '' }) => (
  <nav aria-label={label} className={className}>
    <ul className={cx('shell-tabnav', vertical && 'shell-tabnav--vertical')} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.to}>
          <NavLink to={item.to} end={item.end} className="shell-tabnav__link" onClick={onNavigate || undefined}>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);
TabNav.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ to: PropTypes.string.isRequired, label: PropTypes.node.isRequired, end: PropTypes.bool })).isRequired,
  label: PropTypes.string.isRequired,
  vertical: PropTypes.bool,
  onNavigate: PropTypes.func,
  className: PropTypes.string,
};

/**
 * The masthead: wordmark, role ident, the competition as the "segment", tabs,
 * account controls. Below `lg` the tabs (and `extra`, e.g. a competition
 * picker), and below `md` Profile and Logout too, move into a drawer behind
 * one menu button. The Light/Dark switch never moves into the drawer: it stays
 * in the bar at every width (appearance-everywhere checks it is drawn).
 *
 * `fixed` pins the bar to the viewport instead of the page's flow (screens
 * that pad themselves for a 64px bar).
 */
export const AppHeader = ({
  role = null, segment = null, nav = [], navLabel = 'Sections', onLogout = null, profileTo: profileToProp = null, homeTo = '/',
  extra = null, fixed = false, navFrom = 'lg', compactBrand = false,
}) => {
  const [open, setOpen] = useState(false);
  // Every signed-in role has a profile page at /<role>/profile, so the
  // account menu appears wherever the header has someone to sign out.
  const profileTo = profileToProp || (role && onLogout ? `/${role}/profile` : null);

  /*
   * The breakpoints above are a first guess at when the tabs fit; this is the
   * answer. The bar's parts never shrink (shell.css), so when the tabs, the
   * `extra` and the account controls together need more than the bar has,
   * the bar overflows — and the tabs go into the menu instead of sliding
   * under the role ident, wrapping "Walk-in", or crushing the competition
   * picker under the Light/Dark switch. The width they needed is kept, so
   * they come back only once the bar is that wide again (no flicker at the
   * edge). Every row of tabs, whatever its length or language, fits or folds.
   */
  const barRef = useRef(null);
  const [squeezed, setSqueezed] = useState(false);
  const squeezedRef = useRef(false);
  const neededRef = useRef(0);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !nav.length || typeof ResizeObserver === 'undefined') return undefined;
    const set = (value) => { squeezedRef.current = value; setSqueezed(value); };
    const check = () => {
      if (squeezedRef.current) {
        if (bar.clientWidth >= neededRef.current) set(false);
        return;
      }
      const navEl = bar.querySelector('.shell-header__nav');
      // The breakpoints already sent the tabs to the menu: nothing to measure.
      if (!navEl || getComputedStyle(navEl).display === 'none') return;
      if (bar.scrollWidth > bar.clientWidth + 1) {
        neededRef.current = bar.scrollWidth;
        set(true);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(bar);
    // Content, not just the window: a longer competition name, a web font arriving.
    [...bar.children].forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [nav.length]);

  /*
   * The longest row (Super Admin, thirteen tabs) never fits beside the
   * account controls, so measuring folded every tab into the menu on every
   * screen. From `lg` it gets a row of its own under the bar instead, which
   * wraps rather than folds; phones keep the menu.
   */
  const rowNav = navFrom === 'row' && nav.length > 0;

  /*
   * A fixed header's height is no longer always 64px (the tab row, and its
   * wrap on a narrower laptop), so it publishes its height for the page to
   * pad itself by: `var(--shell-header-h)`.
   */
  const headerRef = useRef(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!fixed || !header || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--shell-header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => { observer.disconnect(); root.style.removeProperty('--shell-header-h'); };
  }, [fixed]);

  return (
    <header ref={headerRef} className={cx('shell-header', fixed && 'shell-header--fixed', navFrom === 'xl' && 'shell-header--nav-xl', navFrom === 'xxl' && 'shell-header--nav-xxl', rowNav && 'shell-header--nav-row', squeezed && 'shell-header--squeezed')}>
      <div className="shell-header__bar" ref={barRef}>
        <div className="shell-header__brand">
          <Wordmark to={homeTo} compact={compactBrand} />
          <RoleIdent role={role} />
          {segment && <span className="shell-header__segment type-body-s">{segment}</span>}
        </div>
        {nav.length > 0 && !rowNav && <TabNav items={nav} label={navLabel} className="shell-header__nav" />}
        {extra && <div className="shell-header__extra">{extra}</div>}
        <AccountControls onLogout={onLogout} profileTo={profileTo} className="shell-header__account" />
        <AppearanceMenu className="shell-header__appearance" />
        <IconButton className="shell-header__menu" label="Menu" icon={MenuIcon} variant="line" aria-expanded={open} onClick={() => setOpen(true)} />
      </div>
      {rowNav && (
        <div className="shell-header__row">
          <TabNav items={nav} label={navLabel} className="shell-header__rownav" />
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" sheet>
        {extra && <div className="shell-drawer__extra">{extra}</div>}
        {nav.length > 0 && <TabNav items={nav} label={navLabel} vertical onNavigate={() => setOpen(false)} />}
        <AccountControls onLogout={onLogout} profileTo={profileTo} appearance={false} drawer className="shell-drawer__account" />
      </Dialog>
    </header>
  );
};
AppHeader.propTypes = {
  role: PropTypes.string,
  segment: PropTypes.node,
  nav: TabNav.propTypes.items,
  navLabel: PropTypes.string,
  onLogout: PropTypes.func,
  profileTo: PropTypes.string,
  homeTo: PropTypes.string,
  extra: PropTypes.node,
  fixed: PropTypes.bool,
  /** Where the tabs join the bar: `xl` for a long row (the admin dashboards' six or seven). */
  navFrom: PropTypes.oneOf(['lg', 'xl', 'xxl', 'row']),
  /** The mark alone (named for screen readers), to leave the bar to the tabs. */
  compactBrand: PropTypes.bool,
};

/** The page header: a tag, the title (display-l), a lede, actions on the right. */
export const PageHeader = ({ eyebrow = null, title, lede = null, actions = null, asIs = false, className = '' }) => (
  <div className={cx('shell-page-header', className)}>
    <div className="shell-page-header__text">
      {eyebrow && <Tag>{eyebrow}</Tag>}
      <Heading level={1} step="display-l" asIs={asIs} className="shell-page-header__title ui-wipe-in">{title}</Heading>
      {lede && <p className="shell-page-header__lede type-body">{lede}</p>}
    </div>
    {actions && <div className="shell-page-header__actions">{actions}</div>}
  </div>
);
PageHeader.propTypes = {
  eyebrow: PropTypes.node, title: PropTypes.node.isRequired, lede: PropTypes.node, actions: PropTypes.node,
  /** The title is a name (a person, a team): keep its case. */
  asIs: PropTypes.bool,
  className: PropTypes.string,
};
