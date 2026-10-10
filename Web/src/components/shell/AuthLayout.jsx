import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import '@/styles/look-fonts';
import { Grain } from '@/components/ui/Stage';
import { PoleMark, Wordmark } from '@/components/brand/Brand';
import { RoleIdent } from './Shell';

/** The portals a visitor can sign in to, in Home's order (its role portal). */
const PORTALS = [
  { key: 'player', label: 'Player', to: '/player/login' },
  { key: 'coach', label: 'Coach', to: '/coach/login' },
  { key: 'judge', label: 'Judge', to: '/judge/login' },
  { key: 'admin', label: 'Admin', to: '/admin/login' },
];

/**
 * The sign-in screens' split layout (design-language PLAN §7 "Auth"): login,
 * register, forgot, reset and admin register.
 *
 * A STAGE side — always the black stage, in either appearance, like Home: the
 * wordmark, the role ident, the role name very large, the pole mark and grain;
 * no photo, to keep phone LCP low. On phones it is a band above the form with
 * the 3px accent rule under it. Then the FORM side on the surface, which the
 * page fills: one saffron submit, links as underlined text, errors inline.
 *
 * `switcher` adds the row of portals (Home's role portal) on sign-in pages.
 * The stage name is the page's h1; the form's own title is an h2.
 */
const AuthLayout = ({ role = null, title, lede = null, switcher = false, children }) => (
  <main className="shell-auth">
    <section className="shell-auth__stage" data-appearance="dark" aria-labelledby="auth-stage-title">
      <Grain local />
      <div className="shell-auth__brand">
        <Wordmark />
      </div>
      <div className="shell-auth__headline">
        <RoleIdent role={role} />
        <h1 id="auth-stage-title" className="shell-auth__title type-display-xl">
          <span className="ui-sting">
            {title}
            <span className="ui-sting__bar" aria-hidden="true" />
          </span>
        </h1>
        {lede && <p className="shell-auth__lede type-body">{lede}</p>}
      </div>
      {switcher && (
        <nav className="shell-auth__portals" aria-label="Sign in as">
          <ul>
            {PORTALS.map((p) => (
              <li key={p.key}>
                <NavLink to={p.to} className="shell-auth__portal type-tag">{p.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <PoleMark className="shell-auth__pole" />
    </section>
    <div className="shell-auth__main">
      <div className="shell-auth__panel">{children}</div>
    </div>
  </main>
);

AuthLayout.propTypes = {
  role: PropTypes.string,
  title: PropTypes.node.isRequired,
  lede: PropTypes.node,
  switcher: PropTypes.bool,
  children: PropTypes.node,
};

/** The form side's title block: a tag, the h2, one line under it. */
export const AuthHeader = ({ tag = null, title, lede = null }) => (
  <header className="shell-auth__header">
    {tag && <p className="shell-auth__tag type-tag">{tag}</p>}
    <h2 className="shell-auth__form-title type-display-l">{title}</h2>
    {lede && <p className="shell-auth__form-lede type-body-s">{lede}</p>}
  </header>
);
AuthHeader.propTypes = { tag: PropTypes.node, title: PropTypes.node.isRequired, lede: PropTypes.node };

/** The links under a form: underlined text, wrapping on phones. */
export const AuthLinks = ({ children }) => <div className="shell-auth__links">{children}</div>;
AuthLinks.propTypes = { children: PropTypes.node };

export default AuthLayout;
