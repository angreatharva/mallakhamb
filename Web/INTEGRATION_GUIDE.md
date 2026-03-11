# Integration Guide for Security Fixes

This guide shows you how to integrate the new security utilities into your existing forms and components.

---

## 1. Rate Limiting for Login Forms

Add rate limiting to prevent brute force attacks on all login pages.

### Files to Update:
- `Web/src/pages/PlayerLogin.jsx`
- `Web/src/pages/CoachLogin.jsx`
- `Web/src/pages/AdminLogin.jsx`
- `Web/src/pages/JudgeLogin.jsx`
- `Web/src/pages/ForgotPassword.jsx`

### Example Implementation:

```javascript
import { useRateLimit } from '../hooks/useRateLimit';

function PlayerLogin() {
  // Add rate limiting hook (5 attempts per 60 seconds)
  const { checkRateLimit, recordAttempt } = useRateLimit(5, 60000);
  
  const onSubmit = async (data) => {
    // Check rate limit before processing
    const { allowed, waitTime } = checkRateLimit();
    
    if (!allowed) {
      toast.error(`Too many login attempts. Please wait ${waitTime} seconds.`);
      return;
    }
    
    // Record this attempt
    recordAttempt();
    
    setLoading(true);
    
    try {
      // Your existing login code here
      const response = await playerAPI.login(data);
      // ... rest of login logic
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  // ... rest of component
}
```

---

## 2. Input Sanitization for Forms

Sanitize all user inputs before sending to the API to prevent XSS attacks.

### Files to Update:
- All registration forms
- All forms that accept user input
- Search inputs
- Team creation forms

### Example Implementation:

```javascript
import { sanitizeObject } from '../utils/sanitize';

function CoachRegister() {
  const onSubmit = async (data) => {
    setLoading(true);
    
    // Sanitize all input data
    const sanitizedData = sanitizeObject(data);
    
    try {
      const response = await coachAPI.register(sanitizedData);
      // ... rest of logic
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };
  
  // ... rest of component
}
```

---

## 3. Centralized Error Handling

Use the centralized error handler for consistent error messages.

### Example Implementation:

```javascript
import { handleAPIError } from '../utils/errorHandler';

function CoachDashboard() {
  const fetchDashboard = async () => {
    try {
      const response = await coachAPI.getDashboard();
      setTeam(response.data.team);
    } catch (error) {
      // Use centralized error handler
      handleAPIError(error, 'Failed to load dashboard');
    }
  };
  
  // ... rest of component
}
```

---

## 4. Email Validation with Suggestions

Use the improved email validation with typo suggestions.

### Example Implementation:

```javascript
import { validateEmailFormat, suggestEmailCorrection } from '../utils/validation';

function PlayerRegister() {
  const validateEmail = (email) => {
    if (!validateEmailFormat(email)) {
      // Check for common typos
      const suggestion = suggestEmailCorrection(email);
      if (suggestion) {
        return `Invalid email. Did you mean ${suggestion}?`;
      }
      return 'Invalid email format';
    }
    return true;
  };
  
  // Use in react-hook-form
  const { register, handleSubmit } = useForm();
  
  <input
    {...register('email', {
      required: 'Email is required',
      validate: validateEmail
    })}
  />
}
```

---

## 5. Complete Example: Secure Login Form

Here's a complete example combining all security features:

```javascript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuth } from '../App';
import { playerAPI } from '../services/api';
import { useRateLimit } from '../hooks/useRateLimit';
import { sanitizeObject } from '../utils/sanitize';
import { handleAPIError } from '../utils/errorHandler';
import { validateEmailFormat } from '../utils/validation';

function PlayerLogin() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Rate limiting: 5 attempts per 60 seconds
  const { checkRateLimit, recordAttempt } = useRateLimit(5, 60000);
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    // 1. Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      toast.error(`Too many attempts. Please wait ${waitTime} seconds.`);
      return;
    }
    
    // 2. Record attempt
    recordAttempt();
    
    // 3. Sanitize input
    const sanitizedData = sanitizeObject(data);
    
    setLoading(true);
    
    try {
      // 4. Make API call
      const response = await playerAPI.login(sanitizedData);
      
      // 5. Store auth data (now encrypted automatically)
      login(response.data.user, response.data.token, 'player');
      
      toast.success('Login successful!');
      navigate('/player/dashboard');
    } catch (error) {
      // 6. Handle errors consistently
      handleAPIError(error, 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        type="email"
        {...register('email', {
          required: 'Email is required',
          validate: (value) => 
            validateEmailFormat(value) || 'Invalid email format'
        })}
        disabled={loading}
      />
      {errors.email && <span>{errors.email.message}</span>}
      
      <input
        type="password"
        {...register('password', {
          required: 'Password is required',
          minLength: {
            value: 6,
            message: 'Password must be at least 6 characters'
          }
        })}
        disabled={loading}
      />
      {errors.password && <span>{errors.password.message}</span>}
      
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

export default PlayerLogin;
```

---

## 6. Testing Checklist

After integrating the security features, test the following:

### Rate Limiting:
- [ ] Try logging in 6 times quickly - should show rate limit message
- [ ] Wait for the countdown and try again - should work
- [ ] Test on different login pages

### Input Sanitization:
- [ ] Try entering `<script>alert('xss')</script>` in text fields
- [ ] Verify it's sanitized before sending to API
- [ ] Check that normal text works fine

### Error Handling:
- [ ] Test with wrong credentials - should show clear error
- [ ] Test with network disconnected - should show network error
- [ ] Test with server down - should show server error

### Token Security:
- [ ] Check localStorage - tokens should be encrypted (not readable)
- [ ] Wait for token to expire - should auto-logout
- [ ] Logout and login again - should work smoothly

### Build:
- [ ] Run `npm run build` - should succeed
- [ ] Check dist folder - no console.log in JS files
- [ ] Test production build with `npm run preview`

---

## 7. Quick Reference

### Import Statements:

```javascript
// Rate limiting
import { useRateLimit } from '../hooks/useRateLimit';

// Input sanitization
import { sanitizeInput, sanitizeObject } from '../utils/sanitize';

// Error handling
import { handleAPIError } from '../utils/errorHandler';

// Email validation
import { validateEmailFormat, suggestEmailCorrection } from '../utils/validation';

// Token utilities (usually not needed in components)
import { isTokenExpired, getTokenData } from '../utils/tokenUtils';

// Secure storage (usually not needed in components)
import { secureStorage } from '../utils/secureStorage';

// Logger (for debugging)
import { logger } from '../utils/logger';
```

---

## 8. Common Patterns

### Pattern 1: Secure Form Submission
```javascript
const onSubmit = async (data) => {
  const sanitizedData = sanitizeObject(data);
  try {
    await api.submit(sanitizedData);
    toast.success('Success!');
  } catch (error) {
    handleAPIError(error);
  }
};
```

### Pattern 2: Rate-Limited Action
```javascript
const { checkRateLimit, recordAttempt } = useRateLimit(3, 30000);

const handleAction = async () => {
  const { allowed, waitTime } = checkRateLimit();
  if (!allowed) {
    toast.error(`Please wait ${waitTime}s`);
    return;
  }
  recordAttempt();
  // Perform action
};
```

### Pattern 3: Safe API Call
```javascript
const fetchData = async () => {
  try {
    const response = await api.getData();
    setData(response.data);
  } catch (error) {
    handleAPIError(error, 'Failed to load data');
  }
};
```

---

## 9. Environment Variables

Make sure to set these in your `.env` file:

```bash
# Required
VITE_API_URL=https://your-api-url.com/api

# Recommended (change in production)
VITE_STORAGE_KEY=your-unique-encryption-key-here
```

---

## 10. Deployment Notes

Before deploying to production:

1. Update `VITE_STORAGE_KEY` to a unique value
2. Verify CSP headers don't block required resources
3. Test all login flows
4. Run `npm run build` and check for errors
5. Test the production build locally with `npm run preview`
6. Monitor console for any errors after deployment

---

## Need Help?

If you encounter any issues:

1. Check the browser console for errors
2. Verify all imports are correct
3. Make sure dependencies are installed: `npm install`
4. Check that the build succeeds: `npm run build`
5. Review the `SECURITY_FIXES_APPLIED.md` document

---

## Summary

The security utilities are now in place and ready to use. The main integration points are:

1. **Rate limiting** - Add to all login forms
2. **Input sanitization** - Add to all forms with user input
3. **Error handling** - Use in all API calls
4. **Email validation** - Use in registration/login forms

All other security features (token encryption, expiry validation, CSP, etc.) are already working automatically through the updated `App.jsx`, `api.js`, and other core files.
