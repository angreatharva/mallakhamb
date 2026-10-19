import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useRateLimit } from '../../hooks/useRateLimit';
import { loginSchema, judgeLoginSchema, playerLoginSchema, validateEmailOrPlayerId } from '@/validators/form.validator';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import AccountLockoutMessage from '@/components/auth/AccountLockoutMessage';
import { Button, Field, Input, PasswordInput, Notice, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

// Import API services
import { adminAPI, superAdminAPI, coachAPI, playerAPI } from '@/services/api';


/**
 * Detect user role from route path
 * @param {string} pathname - Current route pathname
 * @returns {string} Detected role (admin, superadmin, coach, player, judge)
 */
const detectRoleFromPath = (pathname) => {
  const roleMatch = pathname.match(/^\/([^/]+)/);
  if (!roleMatch) return 'admin';
  
  const segment = roleMatch[1].toLowerCase();
  const roleMap = {
    admin: 'admin',
    superadmin: 'superadmin',
    'super-admin': 'superadmin',
    coach: 'coach',
    player: 'player',
    judge: 'judge',
  };
  
  return roleMap[segment] || 'admin';
};

/**
 * Get role-specific configuration
 * @param {string} role - The user role (admin, superadmin, coach, player, judge)
 * @returns {Object} Configuration object with the copy and navigation paths
 */
const getRoleConfig = (role) => {
  // Role-specific content but unified structure
  const roleContent = {
    admin: {
      title: 'Admin',
      subtitle: 'Portal',
      description: 'Manage competitions, teams, judges, and scoring operations.',
      accessLabel: 'Admin Access',
    },
    superadmin: {
      title: 'Super Admin',
      subtitle: 'Portal',
      description: 'Full sovereign access to all competitions, administrators, and platform systems.',
      accessLabel: 'Super Admin Access',
    },
    coach: {
      title: 'Coach',
      subtitle: 'Portal',
      description: 'Manage your team, handle registrations, and guide your athletes to victory.',
      accessLabel: 'Coach Access',
    },
    player: {
      title: 'Player',
      subtitle: 'Portal',
      description: 'Register, join your team, and compete in the ancient art of Mallakhamb.',
      accessLabel: 'Player Access',
    },
    judge: {
      title: 'Judge',
      subtitle: 'Portal',
      description: 'Score performances with precision. Your judgment shapes the competition.',
      accessLabel: 'Judge Access',
    },
  };

  const content = roleContent[role] || roleContent.admin;

  // Unified configuration - same for all roles except content and colors
  return {
    title: content.title,
    subtitle: content.subtitle,
    description: content.description,
    accessLabel: content.accessLabel,
    formTitle: 'Sign In',
    formSubtitle: 'Enter your credentials to continue',
    buttonText: 'Sign In',
    // Judges hold their own accounts now and sign in with their email like
    // everyone else. The old usernames were generated from the panel slot
    // (J1-M-U14-1), which is why they could collide across meets.
    usesEmail: true,
    registerLink: ['coach', 'player', 'judge'].includes(role) ? `/${role}/register` : null,
    // The role says which account to reset when one email owns several.
    forgotPasswordLink: `/forgot-password?role=${role}`,
  };
};

/**
 * UnifiedLogin - the sign-in page for every role; the role comes from the URL.
 */
const UnifiedLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const [loading, setLoading] = useState(false);
  const [lockoutEndTime, setLockoutEndTime] = useState(null);
  const [rateLimitEndTime, setRateLimitEndTime] = useState(null);
  const [loginError, setLoginError] = useState(null);
  
  // Clear lockout/rate limit when timer expires
  useEffect(() => {
    if (lockoutEndTime) {
      const checkLockout = setInterval(() => {
        if (new Date() >= lockoutEndTime) {
          setLockoutEndTime(null);
          clearInterval(checkLockout);
        }
      }, 1000);
      return () => clearInterval(checkLockout);
    }
  }, [lockoutEndTime]);
  
  useEffect(() => {
    if (rateLimitEndTime) {
      const checkRateLimit = setInterval(() => {
        if (new Date() >= rateLimitEndTime) {
          setRateLimitEndTime(null);
          clearInterval(checkRateLimit);
        }
      }, 1000);
      return () => clearInterval(checkRateLimit);
    }
  }, [rateLimitEndTime]);
  
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  const { checkRateLimit, recordAttempt, reset } = useRateLimit(5, 60000);
  
  // Clear login error when user starts typing
  useEffect(() => {
    if (loginError) {
      setLoginError(null);
    }
  }, [location.pathname]); // Clear error when navigating between login pages
  
  // Detect role from path
  const role = detectRoleFromPath(location.pathname);
  const config = getRoleConfig(role);
  
  // Get API service based on role
  const getAPIService = () => {
    const services = {
      admin: adminAPI,
      superadmin: superAdminAPI,
      coach: coachAPI,
      player: playerAPI,
      judge: null, // Judge uses custom axios call
    };
    return services[role];
  };
  
  /*
   * Already signed in and back on the login page — send them on rather than
   * showing a form they do not need.
   *
   * The destination is the level chooser, the same as a fresh sign-in, so the
   * two paths cannot drift. It is safe to land there repeatedly: the chooser
   * reads the stored level but does not act on it, so this cannot loop.
   */
  useEffect(() => {
    if (!user || userType !== role || loading) return;

    const targetPath = role === 'superadmin'
      ? '/superadmin/dashboard'
      : `/${role}/select-level`;

    // Avoid redirect loops when this component is rendered on the destination route.
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [user, userType, role, navigate, loading, location.pathname]);
  
  // Handle form submission
  const onSubmit = async (data) => {
    // Clear any previous login errors
    setLoginError(null);
    
    // Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      const errorMsg = `Too many login attempts. Please wait ${waitTime} seconds.`;
      setLoginError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    // Validate input based on role
    const schema = role === 'judge' ? judgeLoginSchema : role === 'player' ? playerLoginSchema : loginSchema;
    const validation = schema.safeParse(data);
    if (!validation.success) {
      validation.error.errors.forEach((err) => {
        setError(err.path[0], { message: err.message });
      });
      return;
    }
    
    setLoading(true);
    try {
      let response;
      
      // Judge login uses different endpoint
      if (role === 'judge') {
        response = await judgeAPI.login(
          validation.data.email.toLowerCase(),
          validation.data.password
        );
        
        // MED-W6: the raw login response was logged here via console.log,
        // putting the judge's profile and token straight into any shared or
        // recorded dev session. Terser strips console.* from production
        // builds, so this was never a production leak — but it bypassed the
        // project's own logger and there is no reason to print credentials at
        // all. Log presence, not payload, and route it through the logger.
        const { token, judge, competition } = response.data.data;
        logger.log('Judge login response received', {
          hasToken: !!token,
          hasJudge: !!judge,
          hasCompetition: !!competition,
        });

        // Validate that we got the required data
        if (!token || !judge) {
          throw new Error('Invalid login response: missing token or judge data');
        }
        
        // Extract competition context from judge profile
        const competitionId = competition?._id;
        const competitionName = competition?.name;

        // Store user data
        secureStorage.setItem('judge_user', JSON.stringify(judge));
        
        // Store competition context
        if (competitionId) {
          secureStorage.setItem('judge_competition_id', competitionId);
          if (competition) {
            secureStorage.setItem('judge_current_competition', JSON.stringify(competition));
          }
          logger.log('Judge competition context stored:', competitionId);
        }
        
        login(judge, token, 'judge');

        sessionStorage.removeItem('judge_category_selected');
        reset();

        // The dashboard is the judge's home whether or not anyone has seated
        // them yet: it lists the panels they hold, and explains the empty case
        // rather than leaving them on a screen with nothing to do.
        toast.success(
          competitionName
            ? `Welcome ${judge.name}! Assigned to ${competitionName}`
            : `Welcome ${judge.name}!`
        );
        /*
         * To the level chooser like every other role, rather than straight to
         * the dashboard. Login still reports the meet the server picked, but a
         * judge seated at more than one had no way to reach the others from
         * here — the first seat simply won.
         */
        navigate('/judge/select-level');
        return;
      }
      
      // Other roles use API service
      const apiService = getAPIService();
      response = await apiService.login(validation.data);
      
      // Handle nested response structure: {success: true, data: {user, token}}
      const responseData = response.data.data || response.data;
      const { token } = responseData;
      
      const userDataKeyByRole = {
        admin: 'admin',
        superadmin: 'admin',
        coach: 'coach',
        player: 'player',
      };
      const expectedUserKey = userDataKeyByRole[role];
      const userData = responseData[expectedUserKey] || responseData.user || responseData.profile;
      
      if (!token || !userData) {
        throw new Error('Invalid login response');
      }
      
      // Store user data immediately for all roles
      secureStorage.setItem(`${role}_user`, JSON.stringify(userData));
      
      login(userData, token, role);
      toast.success(role === 'coach' ? 'Welcome back, Coach!' : 'Login successful!');
      reset();
      
      /*
       * Post-login navigation.
       *
       * Every competition-scoped role goes to the level chooser first, then to
       * a competition at that level, then to their dashboard. Admin used to
       * open its competition screen as component state here
       * (`showCompetitionSelection`), which gave it no URL and no way back;
       * coach went straight to competition selection with no level step; and
       * player branched on whether it had a squad. All three are now the same
       * two routes.
       *
       * Superadmin is the one exception: it is not scoped to assigned meets, so
       * there is nothing for it to narrow and it goes straight to its dashboard.
       */
      if (role === 'superadmin') {
        setTimeout(() => {
          navigate('/superadmin/dashboard');
        }, 100);
      } else {
        // Small delay so the auth state commits before the guard on the next
        // route reads it.
        setTimeout(() => {
          navigate(`/${role}/select-level`);
        }, 100);
      }
    } catch (error) {
      recordAttempt();
      logger.error(`${role} login error:`, error);
      
      // Handle account lockout errors
      if (error.response?.data?.message?.toLowerCase().includes('locked') || 
          error.response?.data?.message?.toLowerCase().includes('lockout')) {
        const lockoutDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
        const endTime = new Date(Date.now() + lockoutDuration);
        setLockoutEndTime(endTime);
        const errorMsg = 'Account locked due to failed attempts. Try again in 15 minutes.';
        setLoginError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      
      // Handle rate limiting errors (429 status)
      if (error.response?.status === 429) {
        const retryAfter = error.response?.data?.retryAfter || 900; // Default 15 minutes in seconds
        const endTime = new Date(Date.now() + retryAfter * 1000);
        setRateLimitEndTime(endTime);
        const minutes = Math.ceil(retryAfter / 60);
        const errorMsg = `Too many login attempts. Please wait ${minutes} minute${minutes > 1 ? 's' : ''}.`;
        setLoginError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      
      // Handle invalid credentials or other login errors
      const errorMsg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Incorrect credentials. Please try again with correct credentials.';
      setLoginError(errorMsg);
      toast.error(errorMsg);
      
      // DO NOT navigate away - stay on login page
    } finally {
      setLoading(false);
    }
  };
  
  // A player signs in with their own email or their Player ID — for a player
  // using a guardian's email or none, the Player ID is the only login.
  const isPlayer = role === 'player';
  const emailField = config.usesEmail ? 'email' : 'username';
  const blocked = lockoutEndTime !== null || rateLimitEndTime !== null;

  return (
    <AuthLayout role={role} title={config.title} lede={config.description} switcher>
      <AuthHeader tag={config.accessLabel} title={config.formTitle} lede={config.formSubtitle} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        {loginError && (
          <Notice tone="danger" title="Login Failed" role="alert" className="ui-fade-in">
            {loginError}
          </Notice>
        )}

        {/* Account lockout, or the server's rate limit: the same countdown. */}
        {lockoutEndTime && <AccountLockoutMessage lockoutEndTime={lockoutEndTime} />}
        {rateLimitEndTime && !lockoutEndTime && <AccountLockoutMessage lockoutEndTime={rateLimitEndTime} />}

        {isPlayer ? (
          <Field
            id="player-identifier"
            label="Email or Player ID"
            required
            error={errors.identifier?.message}
            help="Your own email, or your Player ID (firstname.lastname.ddmmyy)"
          >
            <Input
              type="text"
              placeholder="you@example.com or aarav.patil.150616"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              {...register('identifier', { validate: validateEmailOrPlayerId })}
            />
          </Field>
        ) : (
          <Field
            id={`${role}-${emailField}`}
            label={config.usesEmail ? 'Email' : 'Username'}
            required
            error={errors[emailField]?.message}
          >
            <Input
              type={config.usesEmail ? 'email' : 'text'}
              placeholder={config.usesEmail ? `${role}@example.com` : 'Enter your username'}
              autoComplete={config.usesEmail ? 'email' : 'username'}
              {...register(emailField, {
                required: `${config.usesEmail ? 'Email' : 'Username'} is required`,
                ...(config.usesEmail && {
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' }
                })
              })}
            />
          </Field>
        )}

        <Field id={`${role}-password`} label="Password" required error={errors.password?.message}>
          <PasswordInput
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password', { required: 'Password is required' })}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          block
          disabled={blocked}
          loading={loading}
          iconRight={loading ? null : ArrowRight}
        >
          {loading ? 'Signing in...' : config.buttonText}
        </Button>
      </form>

      <AuthLinks>
        {config.forgotPasswordLink && (
          <TextLink as={Link} to={config.forgotPasswordLink}>Forgot password?</TextLink>
        )}
        <span className="shell-auth__links-end">
          <TextLink as={Link} to="/" className="ui-link--quiet">← Home</TextLink>
          {config.registerLink && <TextLink as={Link} to={config.registerLink}>Register</TextLink>}
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default UnifiedLogin;
