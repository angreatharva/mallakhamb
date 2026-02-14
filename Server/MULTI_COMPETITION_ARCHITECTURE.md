# Multi-Competition Architecture

## Overview

This document describes the new architecture that allows teams to participate in multiple competitions with different players for each competition.

## Data Models

### 1. Team Model (`models/Team.js`)
Represents a team created by a coach. A team is now competition-independent.

```javascript
{
  name: String,           // Team name (unique per coach)
  coach: ObjectId,        // Reference to Coach
  description: String,    // Team description
  isActive: Boolean       // Whether team is active
}
```

**Key Points:**
- A team can participate in multiple competitions
- Team name must be unique per coach
- No competition-specific data stored here

### 2. CompetitionTeam Model (`models/CompetitionTeam.js`)
Represents a team's registration in a specific competition. This is the many-to-many relationship between teams and competitions.

```javascript
{
  team: ObjectId,              // Reference to Team
  competition: ObjectId,       // Reference to Competition
  coach: ObjectId,             // Reference to Coach
  players: [{                  // Competition-specific players
    player: ObjectId,
    ageGroup: String,
    gender: String
  }],
  isSubmitted: Boolean,        // Submission status for this competition
  submittedAt: Date,
  paymentStatus: String,       // Payment status for this competition
  paymentAmount: Number,
  isActive: Boolean
}
```

**Key Points:**
- One entry per team-competition pair
- Unique constraint on (team, competition)
- Players can differ between competitions
- Each competition has its own submission and payment status

### 3. Competition Model (`models/Competition.js`)
Updated to include teams array.

```javascript
{
  name: String,
  level: String,
  place: String,
  startDate: Date,
  endDate: Date,
  status: String,
  admins: [ObjectId],
  teams: [ObjectId],     // NEW: Array of CompetitionTeam references
  createdBy: ObjectId,
  isDeleted: Boolean
}
```

## User Flow

### Coach Creates Team (First Time)
1. Coach registers → `/coach/register`
2. Coach creates team "SGAM" → `/coach/create-team`
3. Team is created without any competition assignment

### Coach Registers Team for Competition A
1. Coach navigates to `/coach/select-competition`
2. Selects team "SGAM" (Step 1)
3. Selects "Competition A" (Step 2)
4. System creates CompetitionTeam entry linking SGAM to Competition A
5. Coach is redirected to dashboard
6. Coach adds players specific to Competition A

### Coach Registers Same Team for Competition B
1. Coach switches competition using CompetitionSelector in navbar
2. Selects "Competition B"
3. Dashboard shows "No team registered" message
4. Coach clicks "Select Team for Competition"
5. Selects team "SGAM" again (Step 1)
6. Selects "Competition B" (Step 2)
7. System creates NEW CompetitionTeam entry linking SGAM to Competition B
8. Coach is redirected to dashboard
9. Coach adds DIFFERENT players for Competition B

## Key Benefits

1. **Team Reusability**: Same team (SGAM) can participate in multiple competitions
2. **Competition-Specific Players**: Different players for each competition
3. **Independent Submissions**: Each competition has its own submission status
4. **Independent Payments**: Each competition has its own payment tracking
5. **Scalability**: Easy to add more competitions without affecting existing data

## API Endpoints

### Team Management
- `POST /api/coaches/team` - Create a new team (no competition)
- `GET /api/coaches/teams` - Get all teams with their competition registrations
- `POST /api/coaches/team/:teamId/register-competition` - Register team for competition

### Competition Team Management
- `GET /api/coaches/dashboard` - Get competition team for current competition
- `POST /api/coaches/add-player` - Add player to current competition team
- `DELETE /api/coaches/remove-player/:playerId` - Remove player from current competition team
- `POST /api/coaches/submit-team` - Submit team for current competition

## Database Queries

### Get all competitions a team is registered for
```javascript
const registrations = await CompetitionTeam.find({ team: teamId })
  .populate('competition');
```

### Get all teams in a competition
```javascript
const teams = await CompetitionTeam.find({ competition: competitionId })
  .populate('team')
  .populate('coach');
```

### Get team's players for specific competition
```javascript
const competitionTeam = await CompetitionTeam.findOne({
  team: teamId,
  competition: competitionId
}).populate('players.player');
```

## Migration

To migrate existing data from the old structure to the new one:

```bash
node Server/scripts/migrateToCompetitionTeams.js
```

This script will:
1. Find all teams with competition assignments
2. Create CompetitionTeam entries for each
3. Update Competition.teams arrays
4. Preserve all existing data (players, submission status, etc.)

## Frontend Changes

### CoachSelectCompetition.jsx
- Now shows two-step process: Select Team → Select Competition
- Shows all teams (not just unregistered ones)
- Displays how many competitions each team is registered for

### CoachDashboard.jsx
- Shows competition-specific team data
- Players are specific to the selected competition
- Submission status is per competition

### CompetitionSelector (Navbar)
- Allows switching between competitions
- Each competition shows its own team and players

## Backward Compatibility

The Team model still has the old fields (competition, players, etc.) for backward compatibility during migration. These can be removed after:
1. Running the migration script
2. Verifying all data is correctly migrated
3. Testing the application thoroughly

## Future Enhancements

1. **Team Templates**: Allow coaches to copy player rosters between competitions
2. **Bulk Registration**: Register a team for multiple competitions at once
3. **Competition History**: View past competitions a team participated in
4. **Performance Analytics**: Compare team performance across competitions
