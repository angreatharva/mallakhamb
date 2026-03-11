# Deployment Checklist
## Security-Hardened Mallakhamb Backend

Use this checklist before deploying to production.

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Environment Configuration
- [ ] `.env` file exists and is NOT committed to git
- [ ] `JWT_SECRET` is set and is at least 32 characters
- [ ] `JWT_SECRET` is randomly generated (not a dictionary word)
- [ ] `MONGODB_URI` points to production database
- [ ] `EMAIL_USER` and `EMAIL_PASS` are configured
- [ ] `NODE_ENV` is set to `production`
- [ ] `CLIENT_URL` points to production frontend URL
- [ ] `FRONTEND_URL` points to production frontend URL

### Security Validation
- [ ] Server starts without environment variable errors
- [ ] No fallback secrets are being used
- [ ] Password requirements are enforced (test registration)
- [ ] Error responses don't contain stack traces
- [ ] Query parameters are sanitized
- [ ] Score validation is working (0-10 range)

### Database
- [ ] MongoDB is running and accessible
- [ ] Database connection string is correct
- [ ] Database has proper indexes (check with admin)
- [ ] Backup strategy is in place

### Testing
- [ ] Test user registration with weak password (should fail)
- [ ] Test user registration with strong password (should succeed)
- [ ] Test login with valid credentials
- [ ] Test password reset flow
- [ ] Test competition access controls
- [ ] Test score submission with invalid values (should fail)

### Monitoring
- [ ] Server logs are being captured
- [ ] Cleanup jobs are running (check logs for "Cleanup jobs started")
- [ ] Error logging is working
- [ ] Security logs are being written to `logs/security.log`

---

## 🔒 SECURITY VERIFICATION

### Test NoSQL Injection Protection
Try these malicious requests (they should all fail):

```bash
# Test 1: NoSQL injection in query params
curl "http://your-api/api/admin/submitted-teams?gender[$ne]=Male"
# Expected: Should return error or empty results, not bypass filter

# Test 2: Object injection
curl -X POST http://your-api/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": {"$ne": null}, "password": "test"}'
# Expected: Should return authentication error
```

### Test Password Requirements
```bash
# Test weak password
curl -X POST http://your-api/api/players/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "password": "weak",
    "gender": "Male",
    "dateOfBirth": "2000-01-01"
  }'
# Expected: Should return password requirements error
```

### Test Score Validation
```bash
# Test invalid score
curl -X POST http://your-api/api/admin/save-score \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "...",
    "score": 15,
    "judgeType": "Senior Judge",
    "teamId": "...",
    "gender": "Male",
    "ageGroup": "Under12"
  }'
# Expected: Should return "Score must be between 0 and 10"
```

---

## 🚀 DEPLOYMENT STEPS

### 1. Prepare Environment
```bash
# Clone repository
git clone <repository-url>
cd Server

# Install dependencies
npm install --production

# Copy and configure .env
cp .env_example .env
nano .env  # Edit with production values
```

### 2. Validate Configuration
```bash
# Test server startup
npm start

# Check for validation messages:
# ✅ Environment variables validated successfully
# ✅ Cleanup jobs started
```

### 3. Create Initial Super Admin
```bash
# Run the super admin creation script
node scripts/createSuperAdmin.js
```

### 4. Start Production Server
```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start server.js --name mallakhamb-api
pm2 save
pm2 startup

# Or using systemd (Linux)
# Create service file at /etc/systemd/system/mallakhamb.service
```

---

## 📊 POST-DEPLOYMENT VERIFICATION

### Immediate Checks (First 5 minutes)
- [ ] Server is running and responding
- [ ] Health check endpoint works (if implemented)
- [ ] Can create new user with strong password
- [ ] Can login with created user
- [ ] Database connections are stable

### Short-term Checks (First hour)
- [ ] No error spikes in logs
- [ ] Cleanup jobs are running (check logs)
- [ ] Memory usage is stable
- [ ] No authentication issues reported

### Long-term Monitoring (First week)
- [ ] Monitor for failed login attempts
- [ ] Check security logs for suspicious activity
- [ ] Verify cleanup jobs are removing expired tokens
- [ ] Monitor database performance
- [ ] Check for any error patterns

---

## 🐛 ROLLBACK PLAN

If issues occur after deployment:

### Quick Rollback
```bash
# Stop current server
pm2 stop mallakhamb-api

# Revert to previous version
git checkout <previous-commit>
npm install
pm2 restart mallakhamb-api
```

### Database Rollback
- Restore from backup if schema changes were made
- No schema changes in this security update, so DB rollback not needed

---

## 📞 EMERGENCY CONTACTS

- **Technical Lead:** [Name/Contact]
- **Database Admin:** [Name/Contact]
- **Security Team:** [Name/Contact]

---

## 📝 POST-DEPLOYMENT NOTES

Document any issues encountered:

**Date:** ___________  
**Deployed By:** ___________  
**Issues:** ___________  
**Resolution:** ___________

---

**Checklist Version:** 1.0  
**Last Updated:** 2026-03-11
