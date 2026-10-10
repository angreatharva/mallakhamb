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

/** Light/Dark, Profile, Log out — the account cluster every signed-in screen carries. */
export const AccountControls = ({ onLogout, profileTo = null, className = '' }) => (
  // Its own class, not Tailwind's `flex`: a utility here would beat the shell's
  // own breakpoint rules (utilities win ties by design), and the header hides
  // this cluster on phones.
  <div className={cx('shell-account', className)}>
    <AppearanceMenu />
    {profileTo && <IconButton as={Link} to={profileTo} label="Profile" icon={UserRound} variant="ghost" />}
    {onLogout && <Button variant="line" size="sm" icon={LogOut} onClick={onLogout}>Log out</Button>}
  </div>
);
AccountControls.propTypes = { onLogout: PropTypes.func, profileTo: PropTypes.string, className: PropTypes.string };

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
 * account controls. Below `lg` the tabs, and below `md` the account controls
 * too, move into a drawer behind one menu button.
 */
export const AppHeader = ({ role = null, segment = null, nav = [], navLabel = 'Sections', onLogout = null, profileTo = null, homeTo = '/' }) => {
  const [open, setOpen] = useState(false);
  return (
    <header className="shell-header">
      <div className="shell-header__bar">
        <div className="shell-header__brand">
          <Wordmark to={homeTo} />
          <RoleIdent role={role} />
          {segment && <span className="shell-header__segment type-body-s">{segment}</span>}
        </div>
        {nav.length > 0 && <TabNav items={nav} label={navLabel} className="shell-header__nav" />}
        <AccountControls onLogout={onLogout} profileTo={profileTo} className="shell-header__account" />
        <IconButton className="shell-header__menu" label="Menu" icon={MenuIcon} variant="line" aria-expanded={open} onClick={() => setOpen(true)} />
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" sheet>
        {nav.length > 0 && <TabNav items={nav} label={navLabel} vertical onNavigate={() => setOpen(false)} />}
        <AccountControls onLogout={onLogout} profileTo={profileTo} className="shell-drawer__account" />
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
};

/** The page header: a tag, the title (display-l), a lede, actions on the right. */
export const PageHeader = ({ eyebrow = null, title, lede = null, actions = null, className = '' }) => (
  <div className={cx('shell-page-header', className)}>
    <div className="shell-page-header__text">
      {eyebrow && <Tag>{eyebrow}</Tag>}
      <Heading level={1} step="display-l" className="shell-page-header__title ui-wipe-in">{title}</Heading>
      {lede && <p className="shell-page-header__lede type-body">{lede}</p>}
    </div>
    {actions && <div className="shell-page-header__actions">{actions}</div>}
  </div>
);
PageHeader.propTypes = { eyebrow: PropTypes.node, title: PropTypes.node.isRequired, lede: PropTypes.node, actions: PropTypes.node, className: PropTypes.string };
