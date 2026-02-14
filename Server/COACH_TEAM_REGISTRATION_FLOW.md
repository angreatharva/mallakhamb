# Coach Team Registration Flow

## Overview
Coaches automatically get a team created during registration. When they log in, they select a competition and their team gets mapped to that competition automatically.

## New Simplified Flow

### 1. Coach Registration
**Endpoint:** `POST /api/coaches/register`

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Coach registered successfully. Please select a competition to continue.",
  "token": "jwt_token",
  "coach": {
    "id": "coach_id",
    "name": "John Doe",
    "email": "john@example.com",
    "team": "team_id"
  },
  "team": {
    "id": "team_id",
    "name": "John Doe's Team",
    "description": "Team managed by John Doe"
  }
}
```

**What Happens:**
- Coach account is created
- A team is automatically created with the coach's name
- Team is NOT yet assigned to any competition

### 2. Coach Login & Competition Selection
**Endpoint:** `POST /api/coaches/login`

**Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt_token",
  "coach": {
    "id": "coach_id",
    "name": "John Doe",
    "email": "john@example.com",
    "team": "team_id"
  }
}
```

**What Happens:**
- Coach logs in successfully
- Frontend shows competition selection screen
- Coach sees all open competitions (upcoming and ongoing)

### 3. Select Competition (Automatic Team Mapping)
**Endpoint:** `POST /api/auth/set-competition`

**Headers:**
```
Authorization: Bearer <coach_token>
```

**Body:**
```json
{
  "competitionId": "competition_id"
}
```

**Response:**
```json
{
  "message": "Competition context set successfully",
  "token": "new_jwt_token_with_competition",
  "competition": {
    "id": "competition_id",
    "name": "State Championship 2024",
    "level": "state",
    "place": "Mumbai",
    "status": "upcoming",
    "startDate": "2024-06-01",
    "endDate": "2024-06-10"
  }
}
```

**What Happens:**
- Coach selects a competition
- Backend automatically maps the coach's team to the selected competition
- New JWT token is issued with competition context
- Coach is redirected to dashboard

### 4. Dashboard (Add Players)
**Endpoint:** `GET /api/coaches/dashboard`

**Headers:**
```
Authorization: Bearer <coach_token_with_competition>
x-competition-id: <competition_id>
```

**Response:**
```json
{
  "team": {
    "id": "team_id",
    "name": "John Doe's Team",
    "description": "Team managed by John Doe",
    "competition": {
      "id": "competition_id",
      "name": "State Championship 2024",
      "level": "state",
      "place": "Mumbai",
      "startDate": "2024-06-01",
      "endDate": "2024-06-10",
      "status": "upcoming"
    },
    "players": [],
    "isSubmitted": false,
    "paymentStatus": "pending"
  }
}
```

**What Happens:**
- Coach sees their team dashboard
- Team is already mapped to the selected competition
- Coach can now add players

### 5. Add Players (Existing Flow)
**Endpoint:** `POST /api/coaches/add-player`

**Headers:**
```
Authorization: Bearer <coach_token>
x-competition-id: <competition_id>
```

**Body:**
```json
{
  "playerId": "player_id",
  "ageGroup": "U14",
  "gender": "Male"
}
```

### 6. Submit Team & Payment (Existing Flow)
**Endpoint:** `POST /api/coaches/submit-team`

**Headers:**
```
Authorization: Bearer <coach_token>
x-competition-id: <competition_id>
```

## Key Changes

1. **Automatic Team Creation:** Team is created during coach registration
2. **No Manual Team Creation:** Removed the create-team step
3. **Automatic Team Mapping:** When coach selects competition, team is automatically mapped
4. **Simplified Flow:** Register → Login → Select Competition → Add Players → Submit

## Benefits

- Streamlined registration process
- No confusion about team creation
- Automatic team-competition mapping
- Better user experience
- Fewer steps to get started

## Frontend Changes

1. **CoachRegister.jsx:** Redirects to login after registration (not create-team)
2. **CoachLogin.jsx:** Shows competition selection screen after login
3. **CompetitionContext:** Fetches open competitions for coaches
4. **CoachDashboard.jsx:** No changes needed (existing flow works)

## Backend Changes

1. **coachController.js:** 
   - `registerCoach`: Creates team automatically
   - Added `selectCompetitionForTeam`: Maps team to competition
   
2. **authController.js:**
   - `setCompetition`: Automatically maps coach's team to selected competition
   - `getAssignedCompetitions`: Returns only open competitions for coaches

3. **Team Model:** Made competition field optional initially

