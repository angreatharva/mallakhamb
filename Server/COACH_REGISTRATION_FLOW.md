# Coach Registration & Team Management Flow

## Overview
Step-by-step flow where coaches must complete each step before proceeding to the next.

## Complete Flow

### Step 1: Coach Registration
**Page:** `/coach/register`  
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
  "message": "Coach registered successfully. Please create your team.",
  "token": "jwt_token",
  "coach": {
    "id": "coach_id",
    "name": "John Doe",
    "email": "john@example.com",
    "hasTeam": false
  }
}
```

**What Happens:**
- Coach account is created
- Coach is redirected to `/coach/create-team`
- Cannot proceed without creating a team

---

### Step 2: Create Team
**Page:** `/coach/create-team`  
**Endpoint:** `POST /api/coaches/team`

**Headers:**
```
Authorization: Bearer <coach_token>
```

**Body:**
```json
{
  "name": "Sane Guruji Arogya Mandir",
  "description": "Santacruz"
}
```

**Response:**
```json
{
  "message": "Team created successfully. You can now register it for competitions.",
  "team": {
    "id": "team_id",
    "name": "Sane Guruji Arogya Mandir",
    "description": "Santacruz"
  }
}
```

**What Happens:**
- Team is created without competition assignment
- Coach is redirected to `/coach/select-competition`
- Cannot proceed without selecting a competition

---

### Step 3: Select Competition
**Page:** `/coach/select-competition`  
**Endpoint:** `POST /api/coaches/select-competition`

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
  "message": "Competition selected successfully. You can now add players.",
  "team": {
    "id": "team_id",
    "name": "Sane Guruji Arogya Mandir",
    "description": "Santacruz",
    "competition": {
      "id": "competition_id",
      "name": "State Championship 2024",
      "level": "state",
      "place": "Mumbai",
      "startDate": "2024-06-01",
      "endDate": "2024-06-10",
      "status": "upcoming"
    }
  }
}
```

**What Happens:**
- Team is mapped to the selected competition
- Competition context is set in JWT token
- Coach is redirected to `/coach/dashboard`
- Can now add players

---

### Step 4: Add Players
**Page:** `/coach/dashboard`  
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

**Response:**
```json
{
  "message": "Player added to age group successfully!"
}
```

**What Happens:**
- Coach searches for existing players
- Adds players to specific age groups (Boys/Girls U10, U12, U14, etc.)
- Can add multiple players
- Dashboard shows all players organized by age group and gender

---

### Step 5: Submit Team
**Page:** `/coach/dashboard` (Submit Team button)  
**Endpoint:** `POST /api/coaches/submit-team`

**Headers:**
```
Authorization: Bearer <coach_token>
x-competition-id: <competition_id>
```

**Response:**
```json
{
  "message": "Team submitted successfully",
  "submissionDetails": {
    "teamName": "Sane Guruji Arogya Mandir",
    "playerCount": 5,
    "paymentAmount": 1000,
    "submittedAt": "2024-05-15T10:30:00.000Z"
  }
}
```

**What Happens:**
- Team submission is validated (must have at least 1 player)
- Payment amount is calculated (base fee + per player fee)
- Coach is redirected to `/coach/payment`

---

### Step 6: Payment
**Page:** `/coach/payment`

**What Happens:**
- Coach completes payment
- Once payment is successful, team is officially registered for the competition
- Team status changes to "submitted"
- Players are now registered for the specific competition

---

## Login Flow

When a coach logs in, the system checks their status and redirects accordingly:

**Endpoint:** `GET /api/coaches/status`

**Response Examples:**

1. **No Team Created:**
```json
{
  "step": "create-team",
  "message": "Please create your team first",
  "hasTeam": false,
  "hasCompetition": false,
  "canAddPlayers": false
}
```
→ Redirects to `/coach/create-team`

2. **Team Created, No Competition:**
```json
{
  "step": "select-competition",
  "message": "Please select a competition for your team",
  "hasTeam": true,
  "hasCompetition": false,
  "canAddPlayers": false,
  "team": {
    "id": "team_id",
    "name": "Sane Guruji Arogya Mandir",
    "description": "Santacruz"
  }
}
```
→ Redirects to `/coach/select-competition`

3. **Team & Competition Set:**
```json
{
  "step": "add-players",
  "message": "You can now add players to your team",
  "hasTeam": true,
  "hasCompetition": true,
  "canAddPlayers": true,
  "team": {
    "id": "team_id",
    "name": "Sane Guruji Arogya Mandir",
    "description": "Santacruz",
    "competition": {
      "id": "competition_id",
      "name": "State Championship 2024"
    },
    "isSubmitted": false,
    "playerCount": 0
  }
}
```
→ Redirects to `/coach/dashboard`

---

## Key Features

1. **Enforced Step-by-Step Flow:**
   - Cannot skip steps
   - Each step must be completed before proceeding
   - Login automatically redirects to the correct step

2. **Clear Progress Tracking:**
   - Status endpoint shows current step
   - Clear messages guide the coach

3. **Competition Context:**
   - Only required after competition selection
   - Automatically set in JWT token
   - Used for player management and submission

4. **Player Management:**
   - Search existing players
   - Add to specific age groups
   - Organized by gender and age category
   - Can remove players before submission

5. **Team Submission:**
   - Validates player count
   - Calculates payment amount
   - Locks team after submission
   - Requires admin contact for changes after submission

---

## API Endpoints Summary

| Endpoint | Method | Auth | Competition Context | Purpose |
|----------|--------|------|---------------------|---------|
| `/api/coaches/register` | POST | No | No | Register new coach |
| `/api/coaches/login` | POST | No | No | Login coach |
| `/api/coaches/status` | GET | Yes | No | Get registration status |
| `/api/coaches/team` | POST | Yes | No | Create team |
| `/api/coaches/competitions/open` | GET | Yes | No | Get open competitions |
| `/api/coaches/select-competition` | POST | Yes | No | Select competition for team |
| `/api/coaches/dashboard` | GET | Yes | Yes | Get team dashboard |
| `/api/coaches/search-players` | GET | Yes | Yes | Search players |
| `/api/coaches/add-player` | POST | Yes | Yes | Add player to team |
| `/api/coaches/remove-player/:id` | DELETE | Yes | Yes | Remove player from team |
| `/api/coaches/submit-team` | POST | Yes | Yes | Submit team for competition |

---

## Frontend Pages

1. **CoachRegister** (`/coach/register`) - Registration form
2. **CoachLogin** (`/coach/login`) - Login form with smart redirect
3. **CoachCreateTeam** (`/coach/create-team`) - Team creation form
4. **CoachSelectCompetition** (`/coach/select-competition`) - Competition selection
5. **CoachDashboard** (`/coach/dashboard`) - Player management
6. **CoachPayment** (`/coach/payment`) - Payment processing

---

## Benefits

- Clear, linear flow prevents confusion
- Automatic progress tracking
- Cannot skip required steps
- Smart login redirects to correct step
- Competition context only when needed
- Existing player search and management
- Organized by age groups and gender
- Payment integration ready
