# Admin Competition-Based Filtering

## Overview
Admin dashboard now shows only teams and players registered for the selected competition.

## Changes Made

### Backend Changes

#### 1. Admin Controller (`Server/controllers/adminController.js`)

**getDashboardStats:**
- Added competition filter to query
- Now filters teams by `req.competitionId`
- Returns only teams registered for the selected competition
- Statistics (total teams, players, boys, girls) are calculated only for the current competition

```javascript
// Before
const teams = await Team.find({ isActive: true })

// After
let query = { isActive: true };
if (req.competitionId) {
  query.competition = req.competitionId;
}
const teams = await Team.find(query)
```

**getAllTeams:**
- Already had competition filtering implemented
- Uses `req.competitionId` to filter teams

**getAllPlayers:**
- Already had competition filtering implemented
- Filters players by their team's competition
- Uses populate with match to filter teams by competition

#### 2. Admin Routes (`Server/routes/adminRoutes.js`)

**Added Competition Context Middleware:**
- Added `validateCompetitionContext` middleware to `/dashboard` route
- This ensures admin must select a competition before viewing dashboard

```javascript
// Before
router.get('/dashboard', authMiddleware, adminAuth, getDashboardStats);

// After
router.get('/dashboard', authMiddleware, adminAuth, validateCompetitionContext, getDashboardStats);
```

### Frontend Changes

**No changes required!**
- AdminDashboard already uses the API correctly
- Competition context is automatically included in requests via JWT token
- API interceptor extracts competition ID from token and adds `x-competition-id` header

## How It Works

### Flow:
1. Admin logs in
2. Admin selects a competition (via CompetitionSelectionScreen)
3. JWT token is updated with competition ID
4. Admin navigates to dashboard
5. API interceptor extracts competition ID from token
6. Adds `x-competition-id` header to all requests
7. Backend validates competition context
8. Backend filters data by competition ID
9. Dashboard shows only data for selected competition

### Competition Context Flow:

```
Admin Login
    ↓
Select Competition
    ↓
JWT Token Updated (includes competitionId)
    ↓
Dashboard Request
    ↓
API Interceptor (extracts competitionId from token)
    ↓
Adds x-competition-id header
    ↓
Backend Middleware (validateCompetitionContext)
    ↓
Sets req.competitionId
    ↓
Controller Filters Data by Competition
    ↓
Returns Competition-Specific Data
```

## Endpoints Affected

### Require Competition Context:
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/teams` - All teams
- `GET /api/admin/teams/:teamId` - Team details
- `GET /api/admin/players` - All players
- `GET /api/admin/submitted-teams` - Submitted teams
- `POST /api/admin/scores` - Add scores
- `GET /api/admin/scores/*` - All score endpoints

### Do NOT Require Competition Context:
- `GET /api/admin/profile` - Admin profile
- Competition management endpoints (for SuperAdmin)

## SuperAdmin Behavior

SuperAdmin can:
- See all competitions
- Switch between competitions
- View data for any competition
- Manage competitions

SuperAdmin dashboard uses the same filtering when a competition is selected, but can also view system-wide statistics.

## Testing

### Test Scenario 1: Admin with Single Competition
1. Admin logs in
2. Automatically redirected to dashboard (if only one competition)
3. Dashboard shows only teams/players for that competition

### Test Scenario 2: Admin with Multiple Competitions
1. Admin logs in
2. Sees competition selection screen
3. Selects Competition A
4. Dashboard shows only Competition A data
5. Switches to Competition B
6. Dashboard updates to show only Competition B data

### Test Scenario 3: Data Isolation
1. Create Team 1 for Competition A
2. Create Team 2 for Competition B
3. Admin selects Competition A
4. Dashboard shows only Team 1
5. Admin switches to Competition B
6. Dashboard shows only Team 2

## Benefits

1. **Data Isolation:** Admins only see data for their selected competition
2. **Accurate Statistics:** Stats reflect only the current competition
3. **Better Organization:** Clear separation between competitions
4. **Security:** Admins can't accidentally modify data for wrong competition
5. **User Experience:** Focused view reduces confusion

## Database Queries

All queries now include competition filter:

```javascript
// Teams
Team.find({ 
  isActive: true, 
  competition: req.competitionId 
})

// Players (via team)
Player.find(query).populate({
  path: 'team',
  match: { competition: req.competitionId }
})

// Scores
Score.find({ 
  competition: req.competitionId 
})
```

## Notes

- Competition context is stored in JWT token
- Token is updated when admin switches competitions
- API interceptor automatically adds competition header
- No manual header management needed in frontend
- All competition-specific endpoints are protected by middleware
