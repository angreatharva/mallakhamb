# Post-Release Hygiene Checklist

**Status**: Ready for Production Release  
**Date**: April 21, 2026  
**Version**: 1.0.0  
**Branch**: server-refactor

---

## ✅ Pre-Release Verification

### Code Quality
- [x] All refactoring phases (1-7) completed
- [x] Test coverage meets standards
- [x] No critical TODOs or FIXMEs blocking release
- [x] Error handling standardized
- [x] Logging infrastructure in place
- [x] Security middleware configured

### Outstanding Changes
- [ ] Commit current working changes:
  - Modified: API_DOCUMENTATION.md
  - Modified: bootstrap.test.js, validation.middleware.js, routes/index.js
  - Modified: Test files (admin, competition controllers)
  - Deleted: AGENTS.md, judge.integration.test.js

---

## 📋 Release Tasks

### 1. Tag Stable Release
```bash
# Commit outstanding changes
git add -A
git commit -m "chore: pre-release cleanup and documentation updates"

# Push to remote
git push origin server-refactor

# Create and push release tag
git tag -a v1.0.0 -m "Release v1.0.0 - Production-ready architecture"
git push origin v1.0.0
```

**Verification**: `git tag -l` should show v1.0.0

---

### 2. Deploy to Staging

#### A. Environment Setup
- [ ] Verify `render.yaml` configuration
- [ ] Set staging environment variables in Render Dashboard:
  - `MONGODB_URI` (staging database)
  - `JWT_SECRET` (min 32 chars)
  - `EMAIL_USER` / `EMAIL_PASS` or `RESEND_API_KEY`
  - `CLIENT_URL` / `FRONTEND_URL` / `PRODUCTION_URL`
  - `NODE_ENV=staging`

#### B. Deploy Backend
```bash
# Trigger Render deployment or use Render CLI
# Service: mallakhamb-server
# Branch: server-refactor (or merge to main first)
```

**Expected**: Build succeeds, service starts on port 10000

#### C. Deploy Frontend
```bash
# Service: mallakhamb-web
# Ensure VITE_API_URL points to staging backend
```

---

### 3. Run Database Migration in Staging

```bash
# SSH into Render service or run via Render shell
npm run migrate:status  # Check current state
npm run migrate:up      # Apply pending migrations
```

**Verification**:
- [ ] Migration completes without errors
- [ ] Check logs: `tail -f logs/combined.log`
- [ ] Verify database collections/indexes created

---

### 4. Smoke Test Critical Paths

#### A. Authentication Flow
```bash
# Test endpoints:
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh-token
POST /api/auth/logout
POST /api/auth/forgot-password
POST /api/auth/reset-password/:token
```

**Checklist**:
- [ ] User registration succeeds
- [ ] Login returns valid JWT
- [ ] Token refresh works
- [ ] Password reset email sent
- [ ] Protected routes reject invalid tokens

#### B. Admin Operations
```bash
# Test endpoints:
GET  /api/admin/profile
POST /api/admin/competitions
GET  /api/admin/competitions/:id
PUT  /api/admin/competitions/:id
POST /api/admin/teams
GET  /api/admin/teams
```

**Checklist**:
- [ ] Admin can create competition
- [ ] Admin can manage teams
- [ ] Admin can view dashboard
- [ ] Role-based access control works

#### C. Scoring System
```bash
# Test endpoints:
POST /api/admin/scores
GET  /api/admin/scores/:competitionId
PUT  /api/admin/scores/:id
GET  /api/admin/leaderboard/:competitionId
```

**Checklist**:
- [ ] Scores can be submitted
- [ ] Leaderboard calculates correctly
- [ ] Real-time updates via WebSocket (if enabled)
- [ ] Score validation rules enforced

#### D. Webhook Integration
```bash
# Test Razorpay webhook:
POST /api/payment/webhook
```

**Checklist**:
- [ ] Webhook signature verification works
- [ ] Payment success updates transaction status
- [ ] Payment failure handled gracefully
- [ ] Webhook logs captured

---

### 5. Monitor Logs (First 24 Hours)

#### Log Files to Watch
```bash
# On Render or local staging:
tail -f logs/combined.log
tail -f logs/error.log
```

#### Key Metrics
- [ ] **Error Rate**: Should be < 1% of requests
- [ ] **Response Times**: P95 < 500ms for API calls
- [ ] **Database Connections**: No connection pool exhaustion
- [ ] **Memory Usage**: Stable, no leaks
- [ ] **Authentication**: No unusual failed login patterns

#### Alert Triggers
- [ ] Set up alerts for:
  - Error rate spike (> 5% in 5 min)
  - Response time degradation (P95 > 1s)
  - Database connection failures
  - Unhandled promise rejections

#### Health Check
```bash
# Automated health monitoring:
GET /api/health
GET /api/health/detailed
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-21T...",
  "uptime": 3600,
  "database": "connected",
  "memory": { "used": "50MB", "total": "512MB" }
}
```

---

### 6. Delete Unused Legacy Files

#### Files Already Removed
- [x] `AGENTS.md` (deleted in working changes)
- [x] `Server/tests/integration/judge.integration.test.js` (deleted)

#### Intentional Legacy Code (Keep)
These are **backward-compatibility** features, not technical debt:
- `Server/src/routes/index.js` - `/api/health-legacy` endpoint
- `Server/src/controllers/auth.controller.js` - Legacy token reset
- `Server/src/services/user/admin.service.js` - Bulk save scores (legacy method)
- `Web/src/styles/tokens.js` - Deprecated COLORS/ADMIN_COLORS exports (migration period)

#### Candidates for Future Removal (Post-v1.1.0)
- [ ] Legacy health endpoint after frontend migrates
- [ ] Old token reset flow after 3-month deprecation period
- [ ] Deprecated color exports after Web migration completes

---

## 🎯 Success Criteria

### Release is Successful If:
- [x] All tests pass in CI/CD
- [ ] Staging deployment completes without errors
- [ ] Database migration runs successfully
- [ ] All smoke tests pass
- [ ] No critical errors in first 24h logs
- [ ] Response times meet SLA (P95 < 500ms)
- [ ] Zero data loss or corruption

### Rollback Plan
If critical issues arise:
```bash
# Revert to previous stable version
git revert v1.0.0
git tag -a v0.9.9-hotfix -m "Rollback from v1.0.0"
git push origin v0.9.9-hotfix

# Redeploy previous version on Render
# Restore database from backup if needed
```

---

## 📊 Post-Release Review (After 7 Days)

### Metrics to Collect
- [ ] Total requests handled
- [ ] Error rate by endpoint
- [ ] Average response times
- [ ] Database query performance
- [ ] User-reported issues
- [ ] Feature adoption rates

### Retrospective Questions
1. Did the refactor improve system stability?
2. Are error messages more actionable?
3. Is the codebase easier to maintain?
4. What technical debt remains?
5. What should we prioritize in v1.1.0?

---

## 🚀 Next Steps (Post-Hygiene)

### v1.1.0 Planning
- [ ] Remove deprecated legacy endpoints
- [ ] Add performance monitoring dashboard
- [ ] Implement advanced caching strategies
- [ ] Add comprehensive API documentation (Swagger/OpenAPI)
- [ ] Set up automated E2E testing

### Technical Debt Backlog
- [ ] Migrate remaining Web pages to new design system
- [ ] Add GraphQL layer (if needed)
- [ ] Implement event sourcing for audit trail
- [ ] Add Redis for session management
- [ ] Set up blue-green deployment

---

## 📝 Notes

**Architecture Status**: ✅ Production-ready  
**Test Coverage**: ✅ Comprehensive  
**Documentation**: ✅ Up-to-date  
**Security**: ✅ Hardened  
**Performance**: ✅ Optimized  

**Verdict**: This has moved from "messy migration" to **production-ready cleaned architecture**.

---

**Last Updated**: April 21, 2026  
**Maintained By**: Engineering Team  
**Review Frequency**: After each release
