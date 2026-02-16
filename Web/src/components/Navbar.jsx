import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Trophy, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useResponsive } from '../hooks/useResponsive';
import { useCompetition } from '../contexts/CompetitionContext';
import CompetitionSelector from './CompetitionSelector';

const Navbar = ({ user, userType, onLogout }) => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const { clearCompetitionContext } = useCompetition();

  const handleLogout = () => {
    // Clear competition context
    if (clearCompetitionContext) {
      clearCompetitionContext();
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    onLogout();
    navigate('/');
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // Close mobile menu on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu when viewport changes to desktop
  useEffect(() => {
    if (isDesktop && isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [isDesktop, isMobileMenuOpen]);

  return (
    <nav className="bg-white shadow-lg border-b relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo - always visible */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2 touch-target">
              <Trophy className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 hidden sm:block">
                MallakhambIndia
              </span>
              <span className="text-lg font-bold text-gray-900 sm:hidden">
                MI
              </span>
            </Link>
          </div>

          {/* Desktop Navigation - hidden on mobile and tablet */}
          <div className="hidden lg:flex items-center space-x-2">
            {user ? (
              <>
                {/* Competition Selector */}
                {userType && <CompetitionSelector userType={userType} />}
                <div className="flex items-center space-x-2 px-3 py-2">
                  <User className="h-5 w-5 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    {user.firstName || user.name}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-3 py-2"
                  aria-label="Logout"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/player/login"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-3 py-2"
                >
                  Player Login
                </Link>
                <Link
                  to="/coach/login"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-3 py-2"
                >
                  Coach Login
                </Link>
                <Link
                  to="/admin/login"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-3 py-2"
                >
                  Admin Login
                </Link>
                <Link
                  to="/superadmin/login"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-3 py-2"
                >
                  Super Admin Login
                </Link>
              </div>
            )}
          </div>

          {/* Tablet Navigation - visible only on tablet */}
          {isTablet && (
            <div className="hidden md:flex lg:hidden items-center space-x-1">
              {user ? (
                <>
                  <div className="flex items-center space-x-2 px-2 py-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700 truncate max-w-24">
                      {user.firstName || user.name}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-2 py-2"
                    aria-label="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-1">
                  <Link
                    to="/player/login"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-2 py-2 text-sm"
                  >
                    Player
                  </Link>
                  <Link
                    to="/coach/login"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-2 py-2 text-sm"
                  >
                    Coach
                  </Link>
                  <Link
                    to="/admin/login"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors touch-target rounded-lg px-2 py-2 text-sm"
                  >
                    Admin
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Mobile Menu Button - visible only on mobile */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden touch-target-lg rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 ease-in-out active:scale-95"
            aria-label={isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
            aria-expanded={isMobileMenuOpen}
          >
            <div className="relative w-6 h-6">
              <Menu 
                className={`h-6 w-6 absolute inset-0 transition-all duration-300 ease-in-out ${
                  isMobileMenuOpen ? 'opacity-0 rotate-180 scale-75' : 'opacity-100 rotate-0 scale-100'
                }`} 
              />
              <X 
                className={`h-6 w-6 absolute inset-0 transition-all duration-300 ease-in-out ${
                  isMobileMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-180 scale-75'
                }`} 
              />
            </div>
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        <div 
          className={`md:hidden fixed inset-0 z-50 transition-all duration-300 ease-in-out ${
            isMobileMenuOpen 
              ? 'opacity-100 visible' 
              : 'opacity-0 invisible'
          }`}
          style={{ top: 0 }}
        >
          {/* Backdrop */}
          <div 
            className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${
              isMobileMenuOpen ? 'bg-opacity-50' : 'bg-opacity-0'
            }`}
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          
          {/* Menu Panel */}
          <div 
            className={`relative bg-white w-80 max-w-[85vw] h-full shadow-2xl transform transition-transform duration-300 ease-in-out ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Menu Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <Link 
                to="/" 
                className="flex items-center space-x-2 touch-target" 
                onClick={closeMobileMenu}
              >
                <Trophy className="h-6 w-6 text-blue-600" />
                <span className="text-lg font-bold text-gray-900">MallakhambIndia</span>
              </Link>
              <button
                onClick={closeMobileMenu}
                className="touch-target-lg rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-all duration-200 ease-in-out active:scale-95"
                aria-label="Close mobile menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Menu Content */}
            <div className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
              {user ? (
                <>
                  <div className="flex items-center space-x-3 p-4 mb-4 bg-gray-50 rounded-lg border">
                    <div className="flex-shrink-0">
                      <User className="h-6 w-6 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.firstName || user.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {userType || 'User'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout();
                      closeMobileMenu();
                    }}
                    className="w-full flex items-center space-x-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 ease-in-out touch-target-lg rounded-lg px-4 py-3 text-left active:bg-gray-200"
                  >
                    <LogOut className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">Logout</span>
                  </button>
                </>
              ) : (
                <div className="space-y-1">
                  <Link
                    to="/player/login"
                    onClick={closeMobileMenu}
                    className="block w-full text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 ease-in-out touch-target-lg rounded-lg px-4 py-3 font-medium active:bg-gray-200"
                  >
                    Player Login
                  </Link>
                  <Link
                    to="/coach/login"
                    onClick={closeMobileMenu}
                    className="block w-full text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 ease-in-out touch-target-lg rounded-lg px-4 py-3 font-medium active:bg-gray-200"
                  >
                    Coach Login
                  </Link>
                  <Link
                    to="/admin/login"
                    onClick={closeMobileMenu}
                    className="block w-full text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 ease-in-out touch-target-lg rounded-lg px-4 py-3 font-medium active:bg-gray-200"
                  >
                    Admin Login
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
