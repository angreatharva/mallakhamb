import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, Menu as MenuIcon, UserRound } from 'lucide-react';
import '@/styles/look-fonts';
import AppearanceMenu from '@/components/layout/AppearanceMenu';
import { Button, Dialog, Heading, IconButton, Tag } from '@/components/ui';
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

/** Light/Dark, Profile, Logout — the account cluster every signed-in screen carries. "Logout", the site's word for it (the e2e flows find it by that name). */
export const AccountControls = ({ onLogout, profileTo = null, appearance = true, className = '' }) => (
  // Its own class, not Tailwind's `flex`: a utility here would beat the shell's
  // own breakpoint rules (utilities win ties by design), and the header hides
  // this cluster on phones.
  <div className={cx('shell-account', className)}>
    {appearance && <AppearanceMenu />}
    {profileTo && <IconButton as={Link} to={profileTo} label="Profile" icon={UserRound} variant="ghost" />}
    {onLogout && <Button variant="line" size="sm" icon={LogOut} onClick={onLogout}>Logout</Button>}
  </div>
);
AccountControls.propTypes = { onLogout: PropTypes.func, profileTo: PropTypes.string, appearance: PropTypes.bool, className: PropTypes.string };

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
  role = null, segment = null, nav = [], navLabel = 'Sections', onLogout = null, profileTo = null, homeTo = '/',
  extra = null, fixed = false, navFrom = 'lg', compactBrand = false,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <header className={cx('shell-header', fixed && 'shell-header--fixed', navFrom === 'xl' && 'shell-header--nav-xl')}>
      <div className="shell-header__bar">
        <div className="shell-header__brand">
          <Wordmark to={homeTo} compact={compactBrand} />
          <RoleIdent role={role} />
          {segment && <span className="shell-header__segment type-body-s">{segment}</span>}
        </div>
        {nav.length > 0 && <TabNav items={nav} label={navLabel} className="shell-header__nav" />}
        {extra && <div className="shell-header__extra">{extra}</div>}
        <AccountControls onLogout={onLogout} profileTo={profileTo} className="shell-header__account" />
        <AppearanceMenu className="shell-header__appearance" />
        <IconButton className="shell-header__menu" label="Menu" icon={MenuIcon} variant="line" aria-expanded={open} onClick={() => setOpen(true)} />
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" sheet>
        {extra && <div className="shell-drawer__extra">{extra}</div>}
        {nav.length > 0 && <TabNav items={nav} label={navLabel} vertical onNavigate={() => setOpen(false)} />}
        <AccountControls onLogout={onLogout} profileTo={profileTo} appearance={false} className="shell-drawer__account" />
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
  navFrom: PropTypes.oneOf(['lg', 'xl']),
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
