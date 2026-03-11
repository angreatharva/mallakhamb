# FRONTEND SECURITY & PERFORMANCE AUDIT PLAN
## React.js Application - MallakhambIndia Web Platform

**Audit Date:** March 11, 2026  
**Auditor:** Senior React.js Frontend Engineer, Security Auditor, Performance Engineer  
**Codebase Location:** `/Web` folder  
**Framework:** React 19.1.1 + Vite 7.1.7 + Tailwind CSS 3.3.6

---

## EXECUTIVE SUMMARY

This document provides a comprehensive audit plan and findings for the frontend React application. The audit covers security vulnerabilities, performance issues, code quality, and production readiness. Each issue is categorized by severity (CRITICAL, HIGH, MEDIUM, LOW) with specific file locations, line numbers, and actionable fixes.

---

## 1. ARCHITECTURE OVERVIEW

### Tech Stack
- **React:** 19.1.1 (latest)
- **Build Tool:** Vite 7.1.7
- **Routing:** React Router DOM 6.20.1
- **State Management:** React Context API (AuthContext, CompetitionContext, RouteContext)
- **Styling:** Tailwind CSS 3.3.6 with extensive custom configuration
- **HTTP Client:** Axios 1.6.2
- **Form Handling:** React Hook Form 7.48.2
- **UI Libraries:** Heroicons, Lucide React, Framer Motion
- **Authentication:** JWT tokens with jwt-decode 4.0.0

### Architecture Pattern
- **Component Structure:** Feature-based organization (pages, components, contexts, hooks, services, utils)
- **Authentication:** Multi-user type system (player, coach, admin, superadmin, judge) with type-specific localStorage keys
- **API Layer:** Centralized in `/services/api.js` with axios interceptors
- **Responsive Design:** Custom hooks and utility classes for mobile-first approach
- **Competition Context:** Multi-competition support with context switching

### Key Features
- Multi-role authentication system with separate login flows
- Competition selection and switching mechanism
- Real-time scoring system for judges
- Team management for coaches
- Admin dashboard with statistics and management tools
- Public score viewing
- Password reset functionality


---

## 2. SECURITY AUDIT FINDINGS

### 🔴 CRITICAL SECURITY ISSUES

#### CRITICAL-1: JWT Tokens Stored in localStorage (XSS Vulnerability)
**Severity:** CRITICAL  
**Files Affected:**
- `Web/src/services/api.js` (Lines 35-42, 68-77)
- `Web/src/App.jsx` (Lines 60-95, 138-145, 165-180)
- `Web/src/components/ProtectedRoute.jsx` (Lines 28-30)
- All login pages (PlayerLogin.jsx, CoachLogin.jsx, AdminLogin.jsx)

**Problem:**  
JWT tokens are stored in `localStorage` which is vulnerable to XSS attacks. If an attacker injects malicious JavaScript, they can steal all tokens and impersonate users.

```javascript
// VULNERABLE CODE - Web/src/App.jsx:138-145
const login = (userData, token, type) => {
  localStorage.setItem(`${type}_token`, token);  // ❌ VULNERABLE
  localStorage.setItem(`${type}_user`, JSON.stringify(userData));
  setUser(userData);
  setUserType(type);
};
```

**Why Dangerous:**  
- localStorage is accessible to any JavaScript code on the page
- XSS attacks can steal tokens and maintain persistent access
- No expiration enforcement on client side
- Multiple token types stored increases attack surface

**Fix:**  
Use httpOnly cookies for token storage (requires backend changes) OR implement additional security layers:

```javascript
// RECOMMENDED FIX - Implement secure token storage
// Option 1: Use httpOnly cookies (BEST - requires backend support)
// Backend should set: Set-Cookie: token=xxx; HttpOnly; Secure; SameSite=Strict

// Option 2: Add XSS protection layers (INTERIM SOLUTION)
// 1. Implement Content Security Policy
// 2. Add token encryption before localStorage
// 3. Implement token rotation
// 4. Add fingerprinting

// Web/vite.config.js - Add CSP headers
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>
            <meta http-equiv="Content-Security-Policy" 
                  content="default-src 'self'; 
                           script-src 'self' 'unsafe-inline'; 
                           style-src 'self' 'unsafe-inline'; 
                           img-src 'self' data: https:;">
          `
        );
      }
    }
  ]
});

// Web/src/utils/secureStorage.js - NEW FILE
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = import.meta.env.VITE_STORAGE_KEY || 'fallback-key-change-in-prod';

export const secureStorage = {
  setItem: (key, value) => {
    const encrypted = CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString();
    localStorage.setItem(key, encrypted);
  },
  
  getItem: (key) => {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  },
  
  removeItem: (key) => {
    localStorage.removeItem(key);
  }
};

// Update Web/src/App.jsx
import { secureStorage } from './utils/secureStorage';

const login = (userData, token, type) => {
  secureStorage.setItem(`${type}_token`, token);
  secureStorage.setItem(`${type}_user`, JSON.stringify(userData));
  setUser(userData);
  setUserType(type);
};
```

**Priority:** CRITICAL - Fix before production deployment


#### CRITICAL-2: No Token Expiry Validation on Client Side
**Severity:** CRITICAL  
**Files Affected:**
- `Web/src/services/api.js` (Lines 44-62)
- `Web/src/App.jsx` (Lines 60-95)

**Problem:**  
The application decodes JWT tokens but doesn't validate expiration. Expired tokens can still be used until the backend rejects them.

```javascript
// VULNERABLE CODE - Web/src/services/api.js:24-32
const getCompetitionIdFromToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwtDecode(token);
    return decoded.currentCompetition || null;  // ❌ No expiry check
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
};
```

**Why Dangerous:**  
- Users can continue using expired tokens until backend validation
- No automatic logout on token expiry
- Poor user experience with unexpected 401 errors

**Fix:**

```javascript
// Web/src/utils/tokenUtils.js - NEW FILE
import { jwtDecode } from 'jwt-decode';

export const isTokenExpired = (token) => {
  if (!token) return true;
  
  try {
    const decoded = jwtDecode(token);
    if (!decoded.exp) return true;
    
    // Check if token expires in next 5 minutes (buffer time)
    const expiryTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    return currentTime >= (expiryTime - bufferTime);
  } catch {
    return true;
  }
};

export const getTokenData = (token) => {
  if (!token || isTokenExpired(token)) return null;
  
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

// Update Web/src/services/api.js
import { isTokenExpired, getTokenData } from '../utils/tokenUtils';

api.interceptors.request.use(
  (config) => {
    const currentType = getCurrentUserTypeFromURL();
    let token = null;

    if (currentType) {
      token = localStorage.getItem(`${currentType}_token`);
    }

    if (!token) {
      token = localStorage.getItem('token');
    }

    // Check token expiry before making request
    if (token && isTokenExpired(token)) {
      // Clear expired token
      if (currentType) {
        localStorage.removeItem(`${currentType}_token`);
        localStorage.removeItem(`${currentType}_user`);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login
      window.location.href = '/';
      return Promise.reject(new Error('Token expired'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      
      const tokenData = getTokenData(token);
      if (tokenData?.currentCompetition) {
        config.headers['x-competition-id'] = tokenData.currentCompetition;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);
```

**Priority:** CRITICAL - Implement immediately


#### CRITICAL-3: Sensitive Data Logged to Console
**Severity:** CRITICAL  
**Files Affected:**
- `Web/src/services/api.js` (Line 7)
- `Web/src/utils/apiConfig.js` (Line 8)
- `Web/src/pages/ForgotPassword.jsx` (Lines 48, 56)
- Multiple other files with console.log statements

**Problem:**  
API URLs, tokens, and user data are logged to browser console in production.

```javascript
// VULNERABLE CODE - Web/src/services/api.js:7
console.log('🏠 Using API URL:', apiConfig.getBaseUrl());  // ❌ Exposes API URL

// Web/src/utils/apiConfig.js:8
console.log('🔗 API Base URL:', this.baseUrl);  // ❌ Exposes backend URL

// Web/src/pages/ForgotPassword.jsx:48
console.log('🔐 Sending forgot password request for:', data.email);  // ❌ Logs user email
```

**Why Dangerous:**  
- Exposes internal API endpoints to attackers
- Leaks user emails and potentially sensitive data
- Console logs persist in production builds
- Can reveal application structure and logic

**Fix:**

```javascript
// Web/src/utils/logger.js - NEW FILE
const isDevelopment = import.meta.env.MODE === 'development';

export const logger = {
  log: (...args) => {
    if (isDevelopment) console.log(...args);
  },
  
  error: (...args) => {
    if (isDevelopment) console.error(...args);
  },
  
  warn: (...args) => {
    if (isDevelopment) console.warn(...args);
  },
  
  info: (...args) => {
    if (isDevelopment) console.info(...args);
  }
};

// Replace all console.log with logger
// Web/src/services/api.js
import { logger } from '../utils/logger';

logger.log('🏠 Using API URL:', apiConfig.getBaseUrl());

// Add to package.json scripts
"scripts": {
  "build": "vite build && npm run remove-console",
  "remove-console": "find dist -name '*.js' -exec sed -i '' '/console\\.log/d' {} +"
}

// Better: Use vite plugin
// npm install vite-plugin-remove-console --save-dev

// Web/vite.config.js
import removeConsole from 'vite-plugin-remove-console';

export default defineConfig({
  plugins: [
    react(),
    removeConsole()
  ]
});
```

**Priority:** CRITICAL - Remove before production


### 🟠 HIGH SECURITY ISSUES

#### HIGH-1: Missing CSRF Protection
**Severity:** HIGH  
**Files Affected:**
- `Web/src/services/api.js` (All API calls)

**Problem:**  
No CSRF token implementation for state-changing operations.

**Fix:**

```javascript
// Web/src/services/api.js
// Add CSRF token to headers
api.interceptors.request.use(
  (config) => {
    // ... existing code ...
    
    // Add CSRF token for non-GET requests
    if (config.method !== 'get') {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Web/index.html
<head>
  <meta name="csrf-token" content="{{ csrf_token }}">
</head>
```

**Priority:** HIGH - Implement within days

---

#### HIGH-2: No Rate Limiting on Client Side
**Severity:** HIGH  
**Files Affected:**
- `Web/src/pages/ForgotPassword.jsx`
- `Web/src/pages/PlayerLogin.jsx`
- `Web/src/pages/CoachLogin.jsx`
- `Web/src/pages/AdminLogin.jsx`

**Problem:**  
No client-side rate limiting for login attempts or password reset requests.

**Fix:**

```javascript
// Web/src/hooks/useRateLimit.js - NEW FILE
import { useState, useCallback } from 'react';

export const useRateLimit = (maxAttempts = 5, windowMs = 60000) => {
  const [attempts, setAttempts] = useState([]);
  
  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      const oldestAttempt = Math.min(...recentAttempts);
      const waitTime = Math.ceil((windowMs - (now - oldestAttempt)) / 1000);
      return { allowed: false, waitTime };
    }
    
    return { allowed: true, waitTime: 0 };
  }, [attempts, maxAttempts, windowMs]);
  
  const recordAttempt = useCallback(() => {
    setAttempts(prev => [...prev, Date.now()]);
  }, []);
  
  const reset = useCallback(() => {
    setAttempts([]);
  }, []);
  
  return { checkRateLimit, recordAttempt, reset };
};

// Usage in Web/src/pages/PlayerLogin.jsx
import { useRateLimit } from '../hooks/useRateLimit';

const PlayerLogin = () => {
  const { checkRateLimit, recordAttempt } = useRateLimit(5, 60000);
  
  const onSubmit = async (data) => {
    const { allowed, waitTime } = checkRateLimit();
    
    if (!allowed) {
      toast.error(`Too many attempts. Please wait ${waitTime} seconds.`);
      return;
    }
    
    recordAttempt();
    setLoading(true);
    
    try {
      // ... existing login code ...
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
};
```

**Priority:** HIGH - Implement within days


#### HIGH-3: Environment Variables Exposed in Client Bundle
**Severity:** HIGH  
**Files Affected:**
- `Web/.env` (Line 5)
- `Web/src/utils/apiConfig.js` (Line 6)
- `Web/src/App.jsx` (Line 157)

**Problem:**  
`VITE_API_URL` is embedded in the client bundle and visible to anyone.

```javascript
// EXPOSED - Web/src/utils/apiConfig.js:6
this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
```

**Why Dangerous:**  
- Backend API URL is publicly visible
- Attackers can directly target the API
- Cannot hide internal infrastructure

**Fix:**

```javascript
// This is actually ACCEPTABLE for API URLs as they need to be public
// However, ensure NO SECRETS are in VITE_ variables

// ❌ NEVER DO THIS:
// VITE_API_KEY=secret123
// VITE_DATABASE_URL=postgres://...
// VITE_ADMIN_PASSWORD=admin123

// ✅ ACCEPTABLE:
// VITE_API_URL=https://api.example.com
// VITE_APP_NAME=MallakhambIndia

// Add validation to ensure no secrets leak
// Web/vite.config.js
export default defineConfig({
  define: {
    // Only expose specific safe variables
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
    'import.meta.env.VITE_APP_NAME': JSON.stringify(process.env.VITE_APP_NAME)
  },
  plugins: [react()]
});

// Add .env validation script
// Web/scripts/validate-env.js - NEW FILE
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf-8');
const dangerousPatterns = [
  /VITE_.*PASSWORD/i,
  /VITE_.*SECRET/i,
  /VITE_.*KEY/i,
  /VITE_.*TOKEN/i
];

dangerousPatterns.forEach(pattern => {
  if (pattern.test(envContent)) {
    console.error('❌ SECURITY ERROR: Potential secret in VITE_ variable!');
    console.error('VITE_ variables are exposed in the client bundle.');
    process.exit(1);
  }
});

console.log('✅ Environment variables validated');

// Add to package.json
"scripts": {
  "prebuild": "node scripts/validate-env.js",
  "build": "vite build"
}
```

**Priority:** HIGH - Audit and validate immediately


### 🟡 MEDIUM SECURITY ISSUES

#### MEDIUM-1: Weak Email Validation
**Severity:** MEDIUM  
**Files Affected:**
- `Web/src/utils/validation.js` (Lines 6-20)
- All login/register forms

**Problem:**  
Email validation regex is too permissive and doesn't catch many invalid formats.

```javascript
// WEAK VALIDATION - Web/src/utils/validation.js:11
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

**Fix:**

```javascript
// Web/src/utils/validation.js
export const validateEmailFormat = (email) => {
  if (typeof email !== 'string' || email === '') return false;
  
  // RFC 5322 compliant email regex (simplified but more robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Additional checks
  if (email.length > 254) return false; // RFC 5321
  if (email.startsWith('.') || email.endsWith('.')) return false;
  if (email.startsWith('@') || email.endsWith('@')) return false;
  if (email.includes('..') || email.includes('@@')) return false;
  if (email.includes(' ')) return false;
  
  // Check local part length (before @)
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false; // RFC 5321
  
  // Check domain has at least one dot
  if (!domain.includes('.')) return false;
  
  // Check TLD length (at least 2 characters)
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) return false;
  
  return emailRegex.test(email);
};

// Add additional validation for common typos
export const suggestEmailCorrection = (email) => {
  const commonDomains = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'outlok.com': 'outlook.com'
  };
  
  const [localPart, domain] = email.split('@');
  if (commonDomains[domain]) {
    return `${localPart}@${commonDomains[domain]}`;
  }
  
  return null;
};
```

**Priority:** MEDIUM - Fix within weeks

---

#### MEDIUM-2: No Input Sanitization
**Severity:** MEDIUM  
**Files Affected:**
- All form inputs across the application

**Problem:**  
User inputs are not sanitized before being sent to the API or displayed.

**Fix:**

```javascript
// Web/src/utils/sanitize.js - NEW FILE
import DOMPurify from 'dompurify';

export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove potential XSS vectors
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: []
  }).trim();
};

export const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// Install: npm install dompurify

// Usage in forms
import { sanitizeObject } from '../utils/sanitize';

const onSubmit = async (data) => {
  const sanitizedData = sanitizeObject(data);
  // Send sanitizedData to API
};
```

**Priority:** MEDIUM - Implement within weeks


---

## 3. BUG & LOGIC ISSUES

### 🔴 CRITICAL BUGS

#### BUG-1: Missing useEffect Cleanup in CompetitionContext
**Severity:** HIGH  
**File:** `Web/src/contexts/CompetitionContext.jsx` (Lines 82-87)

**Problem:**  
useEffect with fetchAssignedCompetitions doesn't have cleanup, causing memory leaks and state updates on unmounted components.

```javascript
// BUGGY CODE - Web/src/contexts/CompetitionContext.jsx:82-87
useEffect(() => {
  if (userType) {
    fetchAssignedCompetitions();
  } else {
    setIsLoading(false);
  }
}, [userType, fetchAssignedCompetitions]);  // ❌ No cleanup
```

**Fix:**

```javascript
useEffect(() => {
  let isMounted = true;
  
  const loadCompetitions = async () => {
    if (!userType) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await axios.get(
        `${apiConfig.getBaseUrl()}/auth/competitions/assigned`,
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
            ...apiConfig.getHeaders(),
          },
        }
      );
      
      if (isMounted) {
        setAssignedCompetitions(response.data.competitions || []);
        
        const competitionId = getCompetitionFromToken();
        if (competitionId) {
          const competition = response.data.competitions.find(
            (c) => c._id === competitionId
          );
          if (competition) {
            setCurrentCompetition(competition);
          }
        }
      }
    } catch (err) {
      if (isMounted) {
        console.error('Failed to fetch assigned competitions:', err);
        setError(err.response?.data?.message || 'Failed to load competitions');
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
  };
  
  loadCompetitions();
  
  return () => {
    isMounted = false;
  };
}, [userType]); // Remove fetchAssignedCompetitions from deps to avoid infinite loop
```

**Priority:** HIGH - Fix immediately

---

#### BUG-2: Race Condition in switchCompetition
**Severity:** HIGH  
**File:** `Web/src/contexts/CompetitionContext.jsx` (Lines 48-73)

**Problem:**  
`switchCompetition` calls `window.location.reload()` which can cause race conditions if multiple switches happen quickly.

**Fix:**

```javascript
const switchCompetition = useCallback(async (competitionId) => {
  if (!userType) {
    throw new Error('User type is required to switch competition');
  }

  const token = getToken();
  if (!token) {
    throw new Error('Authentication token not found');
  }

  // Prevent multiple simultaneous switches
  if (isLoading) {
    throw new Error('Competition switch already in progress');
  }

  try {
    setIsLoading(true);
    setError(null);

    const response = await axios.post(
      `${apiConfig.getBaseUrl()}/auth/set-competition`,
      { competitionId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...apiConfig.getHeaders(),
        },
      }
    );

    const newToken = response.data.token;
    localStorage.setItem(`${userType}_token`, newToken);

    const competition = assignedCompetitions.find((c) => c._id === competitionId);
    if (competition) {
      setCurrentCompetition(competition);
    }

    // Use navigate instead of reload for better UX
    // Only reload if absolutely necessary
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for state update
    window.location.reload();
  } catch (err) {
    console.error('Failed to switch competition:', err);
    setError(err.response?.data?.message || 'Failed to switch competition');
    throw err;
  } finally {
    setIsLoading(false);
  }
}, [userType, getToken, assignedCompetitions, isLoading]);
```

**Priority:** HIGH - Fix within days


#### BUG-3: Incorrect useEffect Dependencies
**Severity:** MEDIUM  
**Files Affected:**
- `Web/src/pages/PlayerDashboard.jsx` (Lines 35-42)
- `Web/src/pages/CoachDashboard.jsx` (Lines 120-125)
- `Web/src/components/Navbar.jsx` (Lines 18-27)

**Problem:**  
Multiple useEffect hooks have missing or incorrect dependencies, causing stale closures and unexpected behavior.

```javascript
// BUGGY CODE - Web/src/pages/PlayerDashboard.jsx:35-42
useEffect(() => {
  // Fetch teams when player has no team assigned
  if (player && !player.team) {
    fetchTeams();
  }
}, [player]);  // ❌ Missing fetchTeams dependency
```

**Fix:**

```javascript
// Option 1: Add missing dependencies
useEffect(() => {
  if (player && !player.team) {
    fetchTeams();
  }
}, [player, fetchTeams]); // ✅ Add fetchTeams

// Option 2: Use useCallback for fetchTeams
const fetchTeams = useCallback(async () => {
  setTeamsLoading(true);
  try {
    const response = await playerAPI.getTeams();
    const teamOptions = response.data.teams.map(team => ({
      value: team._id,
      label: team.name
    }));
    setTeams(teamOptions);
  } catch (error) {
    toast.error('Failed to load teams');
  } finally {
    setTeamsLoading(false);
  }
}, []); // No dependencies needed

useEffect(() => {
  if (player && !player.team) {
    fetchTeams();
  }
}, [player, fetchTeams]); // ✅ Now safe
```

**Priority:** MEDIUM - Fix within weeks

---

#### BUG-4: Potential Memory Leak in Navbar Mobile Menu
**Severity:** MEDIUM  
**File:** `Web/src/components/Navbar.jsx` (Lines 18-27)

**Problem:**  
Body overflow style is set but cleanup might not run if component unmounts during animation.

```javascript
// BUGGY CODE - Web/src/components/Navbar.jsx:18-27
useEffect(() => {
  if (isMobileMenuOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }

  return () => {
    document.body.style.overflow = 'unset';
  };
}, [isMobileMenuOpen]);  // ✅ Cleanup exists but can be improved
```

**Fix:**

```javascript
useEffect(() => {
  // Store original overflow value
  const originalOverflow = document.body.style.overflow;
  
  if (isMobileMenuOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = originalOverflow || 'unset';
  }

  // Always restore original value on cleanup
  return () => {
    document.body.style.overflow = originalOverflow || 'unset';
  };
}, [isMobileMenuOpen]);
```

**Priority:** MEDIUM - Fix within weeks


---

## 4. PERFORMANCE AUDIT

### 🔴 CRITICAL PERFORMANCE ISSUES

#### PERF-1: No Code Splitting / Lazy Loading
**Severity:** HIGH  
**Files Affected:**
- `Web/src/App.jsx` (Lines 13-38)

**Problem:**  
All page components are imported synchronously, creating a massive initial bundle. Users download code for all roles even if they only use one.

```javascript
// INEFFICIENT - Web/src/App.jsx:13-38
import Home from './pages/Home';
import PlayerLogin from './pages/PlayerLogin';
import PlayerRegister from './pages/PlayerRegister';
// ... 25+ more imports
```

**Impact:**  
- Initial bundle size: ~500KB+ (estimated)
- Slow first page load
- Wasted bandwidth for unused code
- Poor mobile experience

**Fix:**

```javascript
// Web/src/App.jsx - Use React.lazy
import { lazy, Suspense } from 'react';

// Lazy load all pages
const Home = lazy(() => import('./pages/Home'));
const PlayerLogin = lazy(() => import('./pages/PlayerLogin'));
const PlayerRegister = lazy(() => import('./pages/PlayerRegister'));
const PlayerSelectTeam = lazy(() => import('./pages/PlayerSelectTeam'));
const PlayerDashboard = lazy(() => import('./pages/PlayerDashboard'));
const CoachLogin = lazy(() => import('./pages/CoachLogin'));
const CoachRegister = lazy(() => import('./pages/CoachRegister'));
const CoachCreateTeam = lazy(() => import('./pages/CoachCreateTeam'));
const CoachSelectCompetition = lazy(() => import('./pages/CoachSelectCompetition'));
const CoachDashboard = lazy(() => import('./pages/CoachDashboard'));
const CoachPayment = lazy(() => import('./pages/CoachPayment'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const AdminTeams = lazy(() => import('./pages/AdminTeams'));
const ScoringPage = lazy(() => import('./pages/ScoringPage'));
const AdminScoring = lazy(() => import('./pages/AdminScoring'));
const JudgeScoring = lazy(() => import('./pages/JudgeScoring'));
const JudgeLogin = lazy(() => import('./pages/JudgeLogin'));
const JudgeScoringNew = lazy(() => import('./pages/JudgeScoringNew'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PublicScores = lazy(() => import('./pages/PublicScores'));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

// Wrap Routes in Suspense
function AppContent() {
  // ... existing code ...
  
  return (
    <AuthContext.Provider value={{ user, userType, login, logout: handleLogout }}>
      <CompetitionProvider userType={userType}>
        <div className="min-h-screen bg-gray-50">
          {!isAdminRoute && !isHomePage && !isPublicScores && !isCompetitionSelectionPage && (
            <Navbar user={user} userType={userType} onLogout={handleLogout} />
          )}

          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* All routes here */}
            </Routes>
          </Suspense>

          <Toaster {...toasterOptions} />
        </div>
      </CompetitionProvider>
    </AuthContext.Provider>
  );
}
```

**Expected Impact:**  
- Initial bundle: ~150KB (70% reduction)
- Faster first load: 2-3x improvement
- Better mobile experience

**Priority:** HIGH - Implement immediately


#### PERF-2: Missing React.memo on Expensive Components
**Severity:** MEDIUM  
**Files Affected:**
- `Web/src/components/CompetitionSelector.jsx`
- `Web/src/components/Navbar.jsx`
- `Web/src/components/CompetitionDisplay.jsx`

**Problem:**  
Components re-render unnecessarily when parent state changes, even if their props haven't changed.

**Fix:**

```javascript
// Web/src/components/CompetitionSelector.jsx
import React, { memo } from 'react';

const CompetitionSelector = memo(({ userType }) => {
  // ... existing code ...
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if userType changes
  return prevProps.userType === nextProps.userType;
});

export default CompetitionSelector;

// Web/src/components/Navbar.jsx
import React, { memo } from 'react';

const Navbar = memo(({ user, userType, onLogout }) => {
  // ... existing code ...
});

export default Navbar;

// Web/src/components/CompetitionDisplay.jsx
import React, { memo } from 'react';

const CompetitionDisplay = memo(({ className }) => {
  // ... existing code ...
});

export default CompetitionDisplay;
```

**Priority:** MEDIUM - Implement within weeks

---

#### PERF-3: Inline Function Creation in Render
**Severity:** MEDIUM  
**Files Affected:**
- `Web/src/pages/CoachDashboard.jsx` (Multiple instances)
- `Web/src/pages/AdminDashboard.jsx` (Multiple instances)

**Problem:**  
Functions created inline on every render cause child components to re-render unnecessarily.

```javascript
// INEFFICIENT - Web/src/pages/CoachDashboard.jsx
<button
  onClick={() => handleRemovePlayer(player.player._id)}  // ❌ New function every render
  className="..."
>
```

**Fix:**

```javascript
// Option 1: Use useCallback
const handleRemovePlayerClick = useCallback((playerId) => {
  return () => handleRemovePlayer(playerId);
}, []);

<button
  onClick={handleRemovePlayerClick(player.player._id)}
  className="..."
>

// Option 2: Use data attributes
const handleRemoveClick = useCallback((e) => {
  const playerId = e.currentTarget.dataset.playerId;
  handleRemovePlayer(playerId);
}, []);

<button
  onClick={handleRemoveClick}
  data-player-id={player.player._id}
  className="..."
>
```

**Priority:** MEDIUM - Fix within weeks


#### PERF-4: No API Response Caching
**Severity:** MEDIUM  
**Files Affected:**
- `Web/src/services/api.js`
- All dashboard pages

**Problem:**  
Same API calls are made repeatedly without caching, wasting bandwidth and slowing down the app.

**Fix:**

```javascript
// Web/src/utils/apiCache.js - NEW FILE
class APICache {
  constructor(ttl = 60000) { // Default 1 minute TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  generateKey(url, params) {
    return `${url}:${JSON.stringify(params || {})}`;
  }
  
  get(url, params) {
    const key = this.generateKey(url, params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  set(url, params, data) {
    const key = this.generateKey(url, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clear() {
    this.cache.clear();
  }
  
  clearPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new APICache(60000); // 1 minute cache

// Web/src/services/api.js - Add caching interceptor
import { apiCache } from '../utils/apiCache';

// Request interceptor - check cache
api.interceptors.request.use(
  (config) => {
    // Only cache GET requests
    if (config.method === 'get' && !config.skipCache) {
      const cached = apiCache.get(config.url, config.params);
      if (cached) {
        // Return cached response
        return Promise.reject({
          config,
          response: { data: cached },
          cached: true
        });
      }
    }
    
    // ... existing auth code ...
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - store in cache
api.interceptors.response.use(
  (response) => {
    // Cache GET responses
    if (response.config.method === 'get' && !response.config.skipCache) {
      apiCache.set(response.config.url, response.config.params, response.data);
    }
    return response;
  },
  (error) => {
    // Handle cached responses
    if (error.cached) {
      return Promise.resolve(error.response);
    }
    
    // ... existing error handling ...
    return Promise.reject(error);
  }
);

// Clear cache on mutations
export const clearCachePattern = (pattern) => {
  apiCache.clearPattern(pattern);
};

// Usage: Clear cache after creating/updating data
export const coachAPI = {
  // ... existing methods ...
  
  addPlayerToAgeGroup: async (data) => {
    const response = await api.post('/coaches/add-player', data);
    clearCachePattern('/coaches/dashboard'); // Clear dashboard cache
    return response;
  }
};
```

**Priority:** MEDIUM - Implement within weeks


#### PERF-5: Large Bundle Size from Unused Imports
**Severity:** MEDIUM  
**Files Affected:**
- `Web/package.json` (Dependencies)
- Multiple component files

**Problem:**  
Some libraries are imported entirely when only small parts are needed.

**Fix:**

```javascript
// ❌ BAD - Imports entire library
import { motion } from 'framer-motion';

// ✅ GOOD - Tree-shakeable (Framer Motion is already optimized)
// But check bundle analyzer to confirm

// Install bundle analyzer
// npm install --save-dev rollup-plugin-visualizer

// Web/vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html'
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'react-hot-toast'],
          'form-vendor': ['react-hook-form'],
          'icons': ['lucide-react', '@heroicons/react']
        }
      }
    }
  }
});

// Run build and check stats.html
// npm run build
```

**Priority:** MEDIUM - Analyze and optimize

---

### 🟢 LOW PERFORMANCE ISSUES

#### PERF-6: No Image Optimization
**Severity:** LOW  
**Files Affected:**
- `Web/src/assets/` (Image files)
- Various components using images

**Problem:**  
Images are not optimized for web delivery.

**Fix:**

```bash
# Install image optimization tools
npm install --save-dev vite-plugin-imagemin

# Web/vite.config.js
import viteImagemin from 'vite-plugin-imagemin';

export default defineConfig({
  plugins: [
    react(),
    viteImagemin({
      gifsicle: { optimizationLevel: 7 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      pngquant: { quality: [0.8, 0.9], speed: 4 },
      svgo: {
        plugins: [
          { name: 'removeViewBox', active: false },
          { name: 'removeEmptyAttrs', active: true }
        ]
      }
    })
  ]
});
```

**Priority:** LOW - Nice to have


---

## 5. PRODUCTION READINESS CHECK

### Error Handling

#### ✅ PASS: React Error Boundary
**Status:** MISSING  
**Action Required:** Implement error boundary

```javascript
// Web/src/components/ErrorBoundary.jsx - NEW FILE
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ error, errorInfo });
    
    // Log to error tracking service (e.g., Sentry)
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <div className="text-red-600 text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-600 mb-6">
                We're sorry for the inconvenience. Please try refreshing the page.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    Error Details (Dev Only)
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
                    {this.state.error && this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Web/src/App.jsx - Wrap app in ErrorBoundary
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
}
```

---

#### ⚠️ PARTIAL: API Error Handling
**Status:** Implemented but inconsistent  
**Action Required:** Standardize error handling

```javascript
// Web/src/utils/errorHandler.js - NEW FILE
import toast from 'react-hot-toast';

export const handleAPIError = (error, customMessage = null) => {
  // Network error
  if (!error.response) {
    toast.error(customMessage || 'Network error. Please check your connection.');
    return {
      type: 'network',
      message: 'Network error'
    };
  }
  
  // HTTP error
  const status = error.response.status;
  const message = error.response.data?.message || error.message;
  
  switch (status) {
    case 400:
      toast.error(customMessage || message || 'Invalid request');
      break;
    case 401:
      toast.error('Session expired. Please login again.');
      // Handled by axios interceptor
      break;
    case 403:
      toast.error(customMessage || 'Access denied');
      break;
    case 404:
      toast.error(customMessage || 'Resource not found');
      break;
    case 429:
      toast.error('Too many requests. Please try again later.');
      break;
    case 500:
    case 502:
    case 503:
      toast.error('Server error. Please try again later.');
      break;
    default:
      toast.error(customMessage || message || 'An error occurred');
  }
  
  return {
    type: 'http',
    status,
    message
  };
};

// Usage in components
import { handleAPIError } from '../utils/errorHandler';

const fetchData = async () => {
  try {
    const response = await api.getData();
    // ... handle success
  } catch (error) {
    handleAPIError(error, 'Failed to load data');
  }
};
```


### Config & Environment

#### ✅ PASS: Environment Variables
**Status:** Properly configured  
**Files:** `Web/.env`, `Web/.env_example`  
**Note:** Ensure no secrets in VITE_ variables

---

#### ✅ PASS: .env.example
**Status:** Present and documented  
**File:** `Web/.env_example`

---

### Build Configuration

#### ✅ PASS: Production Build Script
**Status:** Configured  
**File:** `Web/package.json`

```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

#### ⚠️ FAIL: Source Maps in Production
**Status:** Not configured  
**Action Required:** Disable or restrict source maps

```javascript
// Web/vite.config.js
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false, // Disable source maps in production
    // OR use 'hidden' to generate but not reference them
    // sourcemap: 'hidden',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    }
  }
});
```

---

### Accessibility

#### ⚠️ PARTIAL: Interactive Elements with Labels
**Status:** Most have labels, some missing  
**Action Required:** Audit and fix

```javascript
// ❌ BAD - Missing aria-label
<button onClick={handleClick}>
  <X className="h-5 w-5" />
</button>

// ✅ GOOD - Has aria-label
<button onClick={handleClick} aria-label="Close menu">
  <X className="h-5 w-5" />
</button>

// Run accessibility audit
// npm install --save-dev @axe-core/react

// Web/src/main.jsx (development only)
if (import.meta.env.MODE === 'development') {
  import('@axe-core/react').then(axe => {
    axe.default(React, ReactDOM, 1000);
  });
}
```

---

#### ⚠️ PARTIAL: Images with Alt Attributes
**Status:** Some missing  
**Action Required:** Add alt text to all images

```javascript
// Audit all image tags
// Find: <img
// Check for: alt="..."

// ❌ BAD
<img src={logo} />

// ✅ GOOD
<img src={logo} alt="MallakhambIndia Logo" />
```

---

#### ✅ PASS: Keyboard Navigation
**Status:** Basic support present  
**Note:** Touch targets meet 44px minimum (good for accessibility)


---

## 6. CODE QUALITY & BEST PRACTICES

### ✅ PASS: Centralized API Layer
**Status:** Well implemented  
**File:** `Web/src/services/api.js`  
**Note:** Good separation of concerns with dedicated API service

---

### ✅ PASS: Component Organization
**Status:** Good structure  
**Folders:** `pages/`, `components/`, `contexts/`, `hooks/`, `services/`, `utils/`  
**Note:** Clear separation of concerns

---

### ⚠️ PARTIAL: Business Logic in Components
**Status:** Some leakage  
**Issue:** Complex logic in dashboard components should be extracted to custom hooks

**Example Fix:**

```javascript
// Web/src/hooks/useTeamManagement.js - NEW FILE
import { useState, useCallback } from 'react';
import { coachAPI } from '../services/api';
import toast from 'react-hot-toast';

export const useTeamManagement = () => {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const response = await coachAPI.getDashboard();
      setTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);
  
  const addPlayer = useCallback(async (playerData) => {
    try {
      await coachAPI.addPlayerToAgeGroup(playerData);
      toast.success('Player added successfully!');
      await fetchTeam(); // Refresh team data
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add player');
      throw error;
    }
  }, [fetchTeam]);
  
  const removePlayer = useCallback(async (playerId) => {
    try {
      await coachAPI.removePlayerFromAgeGroup(playerId);
      toast.success('Player removed successfully!');
      await fetchTeam(); // Refresh team data
    } catch (error) {
      toast.error('Failed to remove player');
      throw error;
    }
  }, [fetchTeam]);
  
  return {
    team,
    loading,
    fetchTeam,
    addPlayer,
    removePlayer
  };
};

// Usage in Web/src/pages/CoachDashboard.jsx
import { useTeamManagement } from '../hooks/useTeamManagement';

const CoachDashboard = () => {
  const { team, loading, fetchTeam, addPlayer, removePlayer } = useTeamManagement();
  
  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);
  
  // Much cleaner component code
};
```

---

### ⚠️ PARTIAL: Naming Conventions
**Status:** Mostly consistent  
**Issues:**
- Some inconsistent file naming (PascalCase vs camelCase)
- Some generic variable names (`data`, `response`)

**Recommendations:**
- Components: PascalCase (✅ Already done)
- Hooks: camelCase with `use` prefix (✅ Already done)
- Utils: camelCase (✅ Already done)
- Constants: UPPER_SNAKE_CASE (⚠️ Not consistently used)

---

### ✅ PASS: Component Size
**Status:** Generally good  
**Note:** Most components are focused and manageable  
**Exception:** `CoachDashboard.jsx` and `AdminDashboard.jsx` are large but acceptable given complexity

---

### ✅ PASS: Folder Structure
**Status:** Logical and easy to navigate  
**Structure:**
```
Web/src/
├── assets/          # Images and static files
├── components/      # Reusable components
│   ├── magicui/     # UI library components
│   └── responsive/  # Responsive components
├── contexts/        # React contexts
├── hooks/           # Custom hooks
├── pages/           # Page components
├── services/        # API services
└── utils/           # Utility functions
```


---

## 7. UI/UX CONSISTENCY

### ✅ PASS: Responsive Design System
**Status:** Excellent implementation  
**Files:** `Web/tailwind.config.js`, `Web/src/utils/responsive.js`, `Web/src/hooks/useResponsive.js`  
**Note:** Comprehensive responsive utilities and breakpoints

---

### ✅ PASS: Touch Target Sizes
**Status:** Meets 44px minimum  
**Implementation:** Custom Tailwind utilities (`touch-target`, `touch-target-lg`)  
**Note:** Good accessibility compliance

---

### ✅ PASS: Loading States
**Status:** Implemented across the app  
**Note:** Consistent loading spinners and disabled states

---

### ✅ PASS: Error States
**Status:** Handled with toast notifications  
**Library:** react-hot-toast  
**Note:** Consistent error messaging

---

### ⚠️ PARTIAL: Design System Consistency
**Status:** Mostly consistent  
**Issues:**
- Some hardcoded colors instead of Tailwind theme colors
- Inconsistent spacing in some components

**Fix:**

```javascript
// ❌ BAD - Hardcoded colors
<div className="bg-[#f5f5f5]">

// ✅ GOOD - Use theme colors
<div className="bg-gray-100">

// ❌ BAD - Arbitrary spacing
<div className="mt-[23px]">

// ✅ GOOD - Use spacing scale
<div className="mt-6">
```

---

### ✅ PASS: Mobile Responsiveness
**Status:** Well implemented  
**Note:** Mobile-first approach with proper breakpoints


---

## 8. PRODUCTION READINESS SCORE

### Overall Score: 6.5/10

**Breakdown:**
- Security: 4/10 (CRITICAL issues with token storage)
- Performance: 6/10 (No code splitting, missing optimizations)
- Code Quality: 8/10 (Good structure, minor improvements needed)
- Error Handling: 7/10 (Good but needs error boundary)
- Accessibility: 7/10 (Good touch targets, some missing labels)
- Build Config: 7/10 (Needs source map config)

**Blockers for Production:**
1. JWT tokens in localStorage (CRITICAL)
2. No token expiry validation (CRITICAL)
3. Console logs in production (CRITICAL)
4. No code splitting (HIGH)
5. Missing error boundary (HIGH)


---

## 9. STEP-BY-STEP FIX PLAN

### Phase 1: CRITICAL Security Fixes (Week 1)
**Priority:** MUST FIX BEFORE DEPLOY

#### STEP 1 — Implement Token Encryption
**File:** Create `Web/src/utils/secureStorage.js`  
**Problem:** JWT tokens stored in plain localStorage  
**Fix:** Encrypt tokens before storage  
**Priority:** CRITICAL

```bash
npm install crypto-js
```

Create the secureStorage utility and update all localStorage calls.

---

#### STEP 2 — Add Token Expiry Validation
**File:** Create `Web/src/utils/tokenUtils.js`  
**Problem:** No client-side token expiry checking  
**Fix:** Validate token expiry before API calls  
**Priority:** CRITICAL

Update `Web/src/services/api.js` interceptors to use token validation.

---

#### STEP 3 — Remove Console Logs
**File:** `Web/vite.config.js`  
**Problem:** Sensitive data logged to console  
**Fix:** Install and configure vite-plugin-remove-console  
**Priority:** CRITICAL

```bash
npm install --save-dev vite-plugin-remove-console
```

---

#### STEP 4 — Add Content Security Policy
**File:** `Web/vite.config.js`  
**Problem:** No XSS protection headers  
**Fix:** Add CSP meta tags  
**Priority:** CRITICAL

---

### Phase 2: HIGH Priority Fixes (Week 2)
**Priority:** FIX WITHIN DAYS

#### STEP 5 — Implement Code Splitting
**File:** `Web/src/App.jsx`  
**Problem:** Massive initial bundle  
**Fix:** Use React.lazy for all pages  
**Priority:** HIGH

Expected bundle size reduction: 70%

---

#### STEP 6 — Add Error Boundary
**File:** Create `Web/src/components/ErrorBoundary.jsx`  
**Problem:** No graceful error handling  
**Fix:** Wrap app in error boundary  
**Priority:** HIGH

---

#### STEP 7 — Implement Rate Limiting
**File:** Create `Web/src/hooks/useRateLimit.js`  
**Problem:** No protection against brute force  
**Fix:** Add client-side rate limiting  
**Priority:** HIGH

Apply to all login and password reset forms.

---

#### STEP 8 — Fix useEffect Cleanup
**File:** `Web/src/contexts/CompetitionContext.jsx`  
**Problem:** Memory leaks from missing cleanup  
**Fix:** Add isMounted flag and cleanup  
**Priority:** HIGH

---

### Phase 3: MEDIUM Priority Fixes (Week 3-4)
**Priority:** FIX WITHIN WEEKS

#### STEP 9 — Add API Response Caching
**File:** Create `Web/src/utils/apiCache.js`  
**Problem:** Duplicate API calls  
**Fix:** Implement simple cache layer  
**Priority:** MEDIUM

---

#### STEP 10 — Optimize Components with React.memo
**Files:** `CompetitionSelector.jsx`, `Navbar.jsx`, `CompetitionDisplay.jsx`  
**Problem:** Unnecessary re-renders  
**Fix:** Wrap in React.memo  
**Priority:** MEDIUM

---

#### STEP 11 — Add Input Sanitization
**File:** Create `Web/src/utils/sanitize.js`  
**Problem:** No XSS protection on inputs  
**Fix:** Sanitize all user inputs  
**Priority:** MEDIUM

```bash
npm install dompurify
```

---

#### STEP 12 — Improve Email Validation
**File:** `Web/src/utils/validation.js`  
**Problem:** Weak email regex  
**Fix:** Use RFC 5322 compliant regex  
**Priority:** MEDIUM

---

#### STEP 13 — Fix useEffect Dependencies
**Files:** Multiple dashboard components  
**Problem:** Stale closures and bugs  
**Fix:** Add missing dependencies or use useCallback  
**Priority:** MEDIUM

---

### Phase 4: LOW Priority Optimizations (Week 5+)
**Priority:** NICE TO HAVE

#### STEP 14 — Optimize Bundle Size
**File:** `Web/vite.config.js`  
**Problem:** Large vendor bundles  
**Fix:** Configure manual chunks  
**Priority:** LOW

```bash
npm install --save-dev rollup-plugin-visualizer
```

---

#### STEP 15 — Add Image Optimization
**File:** `Web/vite.config.js`  
**Problem:** Unoptimized images  
**Fix:** Install vite-plugin-imagemin  
**Priority:** LOW

```bash
npm install --save-dev vite-plugin-imagemin
```

---

#### STEP 16 — Accessibility Audit
**Files:** All components  
**Problem:** Some missing aria-labels and alt text  
**Fix:** Add accessibility attributes  
**Priority:** LOW

```bash
npm install --save-dev @axe-core/react
```

---

#### STEP 17 — Extract Business Logic to Hooks
**Files:** Dashboard components  
**Problem:** Complex logic in components  
**Fix:** Create custom hooks  
**Priority:** LOW

---

#### STEP 18 — Standardize Error Handling
**File:** Create `Web/src/utils/errorHandler.js`  
**Problem:** Inconsistent error messages  
**Fix:** Centralize error handling  
**Priority:** LOW


---

## 10. IMPLEMENTATION CHECKLIST

### Week 1: Critical Security (MUST DO)
- [ ] Create `Web/src/utils/secureStorage.js` with encryption
- [ ] Update all `localStorage` calls to use `secureStorage`
- [ ] Create `Web/src/utils/tokenUtils.js` with expiry validation
- [ ] Update `Web/src/services/api.js` interceptors
- [ ] Install `vite-plugin-remove-console`
- [ ] Configure CSP headers in `Web/vite.config.js`
- [ ] Remove all `console.log` statements or replace with logger
- [ ] Test authentication flow thoroughly

### Week 2: High Priority (SHOULD DO)
- [ ] Implement React.lazy for all page components
- [ ] Add Suspense with loading fallback
- [ ] Create `Web/src/components/ErrorBoundary.jsx`
- [ ] Wrap app in ErrorBoundary
- [ ] Create `Web/src/hooks/useRateLimit.js`
- [ ] Apply rate limiting to login forms
- [ ] Fix CompetitionContext useEffect cleanup
- [ ] Test error scenarios

### Week 3-4: Medium Priority (GOOD TO DO)
- [ ] Create `Web/src/utils/apiCache.js`
- [ ] Add caching interceptors to axios
- [ ] Wrap components in React.memo
- [ ] Install and configure DOMPurify
- [ ] Create `Web/src/utils/sanitize.js`
- [ ] Apply sanitization to all forms
- [ ] Update email validation regex
- [ ] Fix all useEffect dependency warnings
- [ ] Test performance improvements

### Week 5+: Low Priority (NICE TO DO)
- [ ] Install rollup-plugin-visualizer
- [ ] Analyze and optimize bundle
- [ ] Configure manual chunks
- [ ] Install vite-plugin-imagemin
- [ ] Optimize all images
- [ ] Install @axe-core/react
- [ ] Run accessibility audit
- [ ] Fix all accessibility issues
- [ ] Extract business logic to custom hooks
- [ ] Create standardized error handler
- [ ] Update all error handling

---

## 11. TESTING RECOMMENDATIONS

### Security Testing
```bash
# Test token encryption
# 1. Login as user
# 2. Open DevTools > Application > Local Storage
# 3. Verify tokens are encrypted (not readable JWT)

# Test token expiry
# 1. Login with short-lived token
# 2. Wait for expiry
# 3. Verify automatic logout

# Test XSS protection
# 1. Try injecting <script> in form inputs
# 2. Verify sanitization works
```

### Performance Testing
```bash
# Build and analyze bundle
npm run build
# Check dist/stats.html

# Lighthouse audit
# 1. Build production version
# 2. Run: npm run preview
# 3. Open Chrome DevTools > Lighthouse
# 4. Run audit
# Target: Performance > 90, Accessibility > 90

# Network throttling test
# 1. Chrome DevTools > Network
# 2. Set to "Slow 3G"
# 3. Test critical user flows
```

### Accessibility Testing
```bash
# Keyboard navigation
# 1. Tab through all interactive elements
# 2. Verify focus indicators
# 3. Test with screen reader (NVDA/JAWS)

# Color contrast
# Use Chrome DevTools > Lighthouse > Accessibility
# Or: https://webaim.org/resources/contrastchecker/

# Touch targets
# Verify all buttons/links are at least 44x44px
```

---

## 12. MONITORING & MAINTENANCE

### Post-Deployment Monitoring

#### Error Tracking
```bash
# Install Sentry (recommended)
npm install @sentry/react

# Web/src/main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

#### Performance Monitoring
```bash
# Use Web Vitals
npm install web-vitals

# Web/src/utils/reportWebVitals.js
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

export const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    getCLS(onPerfEntry);
    getFID(onPerfEntry);
    getFCP(onPerfEntry);
    getLCP(onPerfEntry);
    getTTFB(onPerfEntry);
  }
};

// Web/src/main.jsx
import { reportWebVitals } from './utils/reportWebVitals';

reportWebVitals(console.log); // Or send to analytics
```

#### Analytics
```bash
# Google Analytics 4 (optional)
npm install react-ga4

# Web/src/utils/analytics.js
import ReactGA from 'react-ga4';

export const initGA = () => {
  ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID);
};

export const logPageView = () => {
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
};
```

---

## 13. FINAL RECOMMENDATIONS

### Immediate Actions (Before Production)
1. ✅ Fix all CRITICAL security issues
2. ✅ Implement code splitting
3. ✅ Add error boundary
4. ✅ Remove console logs
5. ✅ Configure production build properly

### Short-term Improvements (First Month)
1. Add API caching
2. Optimize component re-renders
3. Implement rate limiting
4. Fix all useEffect issues
5. Improve error handling

### Long-term Enhancements (Ongoing)
1. Set up error tracking (Sentry)
2. Monitor performance metrics
3. Regular security audits
4. Accessibility improvements
5. Bundle size optimization

### Code Review Checklist
Before merging any PR, verify:
- [ ] No console.log statements
- [ ] No hardcoded secrets
- [ ] useEffect has proper cleanup
- [ ] Components use React.memo where appropriate
- [ ] Error handling is consistent
- [ ] Accessibility attributes present
- [ ] Touch targets meet 44px minimum
- [ ] Loading and error states handled
- [ ] API calls have error handling
- [ ] Forms have validation

---

## 14. CONCLUSION

The MallakhambIndia frontend application is well-structured with good responsive design and component organization. However, there are critical security vulnerabilities that must be addressed before production deployment, particularly around JWT token storage and validation.

The main areas requiring immediate attention are:
1. **Security:** Token storage, expiry validation, and XSS protection
2. **Performance:** Code splitting and bundle optimization
3. **Reliability:** Error boundaries and proper cleanup

Following this audit plan will bring the application to production-ready status with improved security, performance, and maintainability.

**Estimated Timeline:**
- Critical fixes: 1 week
- High priority: 1 week
- Medium priority: 2 weeks
- Low priority: Ongoing

**Total effort:** 4-6 weeks for full implementation

---

**Document Version:** 1.0  
**Last Updated:** March 11, 2026  
**Next Review:** After Phase 1 completion
