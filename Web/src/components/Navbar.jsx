import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Trophy, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompetition } from '../contexts/CompetitionContext';
import CompetitionSelector from './CompetitionSelector';
import { COLORS, useReducedMotion } from '../pages/public/Home';

void motion;

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

const Navbar = ({ user, userType, onLogout }) => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReducedMotion();
  const { clearCompetitionContext } = useCompetition();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    if (clearCompetitionContext) clearCompetitionContext();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    onLogout();
    navigate('/');
  };

  const navLinks = !user
    ? [
        { to: '/player/login', label: 'Player' },
        { to: '/coach/login', label: 'Coach' },
        { to: '/admin/login', label: 'Admin' },
      ]
    : [];

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: scrolled ? 'rgba(10,10,10,0.94)' : 'rgba(10,10,10,0.75)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${scrolled ? COLORS.darkBorder : 'transparent'}`,
        transition: 'background 0.3s, border-color 0.3s',
      }}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group" aria-label="MallakhambIndia Home">
          <motion.div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`,
            }}
            whileHover={{ scale: 1.08, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Trophy className="w-4 h-4 text-white" aria-hidden="true" />
          </motion.div>
          <span className="text-white font-bold text-sm tracking-wide hidden sm:block">
            Mallakhamb<span style={{ color: COLORS.saffron }}>India</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-2">
          {user ? (
            <>
              {userType && <CompetitionSelector userType={userType} />}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{
                  borderColor: COLORS.darkBorderSubtle,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${COLORS.saffron}20` }}
                >
                  <User
                    className="w-3.5 h-3.5"
                    style={{ color: COLORS.saffronLight }}
                    aria-hidden="true"
                  />
                </div>
                <span className="text-white/80 text-sm font-medium">
                  {user.firstName || user.name}
                </span>
              </div>
              <motion.button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors min-h-[44px]"
                style={{
                  borderColor: 'rgba(239,68,68,0.3)',
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.06)',
                }}
                whileHover={{
                  background: 'rgba(239,68,68,0.12)',
                  borderColor: 'rgba(239,68,68,0.5)',
                }}
                whileTap={{ scale: 0.96 }}
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Logout
              </motion.button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="relative px-4 py-2 rounded-xl text-sm font-semibold text-white/65 hover:text-white transition-colors duration-200 min-h-[44px] flex items-center group"
                >
                  {link.label}
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 group-hover:w-4 transition-all duration-300 rounded-full"
                    style={{ background: COLORS.saffron }}
                  />
                </Link>
              ))}
              <Link
                to="/superadmin/login"
                className="ml-2 px-4 py-2 rounded-xl text-xs font-semibold text-white/30 hover:text-white/60 border transition-all duration-200 min-h-[44px] flex items-center"
                style={{ borderColor: COLORS.darkBorderSubtle }}
              >
                Super Admin
              </Link>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden p-2 rounded-xl text-white min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          style={{ background: isMobileMenuOpen ? `${COLORS.saffron}18` : 'transparent' }}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isMobileMenuOpen ? 'x' : 'menu'}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </motion.div>
          </AnimatePresence>
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', top: 64 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              id="mobile-menu"
              className="lg:hidden fixed left-0 right-0 z-50 border-t"
              style={{
                top: 64,
                background: 'rgba(10,10,10,0.98)',
                backdropFilter: 'blur(24px)',
                borderColor: COLORS.darkBorder,
              }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              role="navigation"
              aria-label="Mobile navigation"
            >
              <div className="px-4 py-5 space-y-2 max-h-[80vh] overflow-y-auto">
                {user ? (
                  <>
                    <div
                      className="flex items-center gap-3 p-4 rounded-2xl border mb-3"
                      style={{ borderColor: COLORS.darkBorder, background: `${COLORS.saffron}08` }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: `${COLORS.saffron}20` }}
                      >
                        <User className="w-5 h-5" style={{ color: COLORS.saffronLight }} />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">
                          {user.firstName || user.name}
                        </p>
                        <p className="text-white/40 text-xs capitalize">{userType || 'User'}</p>
                      </div>
                    </div>
                    {userType && (
                      <div className="mb-2">
                        <CompetitionSelector userType={userType} />
                      </div>
                    )}
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-colors"
                      style={{
                        color: '#EF4444',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                      }}
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    {navLinks.map((link, i) => (
                      <motion.div
                        key={link.to}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Link
                          to={link.to}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="block px-4 py-3 rounded-xl text-white/80 hover:text-white font-medium transition-all min-h-[44px] flex items-center"
                          style={{ background: 'rgba(255,255,255,0.04)' }}
                        >
                          {link.label} Login
                        </Link>
                      </motion.div>
                    ))}
                    <motion.div
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      <Link
                        to="/superadmin/login"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-white/35 hover:text-white/60 text-sm font-medium transition-all min-h-[44px] flex items-center border"
                        style={{ borderColor: COLORS.darkBorderSubtle }}
                      >
                        Super Admin Login
                      </Link>
                    </motion.div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
