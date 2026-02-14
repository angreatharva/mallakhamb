# Migration Guide: Old Team Model → New CompetitionTeam Model

## Problem
You're seeing the error: "Team is already registered for a competition. Create a new team for additional competitions."

This happens because:
1. Your database still has old Team documents with the `competition` field
2. Your server might be running old code

## Solution Steps

### Step 1: Stop the Server
```bash
# Stop your Node.js server
# Press Ctrl+C in the terminal where the server is running
```

### Step 2: Run the Migration Script
This creates CompetitionTeam entries from existing Team data:

```bash
node Server/scripts/migrateToCompetitionTeams.js
```

This will:
- Find all teams with competition assignments
- Create CompetitionTeam entries for each
- Update Competition.teams arrays
- Preserve all existing data (players, submission status, etc.)

### Step 3: Clean Up Old Fields (Optional but Recommended)
This removes old fields from Team documents:

```bash
node Server/scripts/cleanupOldTeamFields.js
```

This will:
- Remove `competition` field from Team documents
- Remove `players` field from Team documents
- Remove `isSubmitted`, `submittedAt`, `paymentStatus`, `paymentAmount` fields

**WARNING:** Only run this AFTER verifying the migration worked correctly!

### Step 4: Restart the Server
```bash
# Start your server again
npm start
# or
node Server/server.js
# or whatever command you use
```

### Step 5: Test the Flow

1. **Login as coach**
2. **Go to Select Competition page** (`/coach/select-competition`)
3. **Select team "SGAM"**
4. **Select competition "comp-A"**
5. **Should redirect to dashboard** - Add players for comp-A
6. **Switch competition** using navbar selector to "comp-B"
7. **Dashboard shows "No team registered"**
8. **Click "Select Team for Competition"**
9. **Select same team "SGAM"** again
10. **Select competition "comp-B"**
11. **Should redirect to dashboard** - Add DIFFERENT players for comp-B

## Verification

### Check if migration worked:

```javascript
// In MongoDB shell or Compass
db.competitionteams.find({ coach: ObjectId("YOUR_COACH_ID") })
```

You should see multiple CompetitionTeam documents for the same team but different competitions.

### Check if cleanup worked:

```javascript
// In MongoDB shell or Compass
db.teams.findOne({ _id: ObjectId("YOUR_TEAM_ID") })
```

The document should NOT have `competition`, `players`, `isSubmitted` fields.

## Troubleshooting

### Error: "Team is already registered for a competition"
- **Cause**: Server is running old code
- **Solution**: Restart the server (Step 4)

### Error: "Team not found"
- **Cause**: Team was deleted or doesn't belong to you
- **Solution**: Create a new team

### Dashboard shows old players
- **Cause**: Browser cache
- **Solution**: Hard refresh (Ctrl+Shift+R) or clear browser cache

### Players not showing up
- **Cause**: CompetitionTeam not created properly
- **Solution**: Re-run migration script

## Rollback (If Something Goes Wrong)

If you need to rollback:

1. **Restore database from backup** (if you made one)
2. **Or manually fix data**:
   ```javascript
   // Delete all CompetitionTeam entries
   db.competitionteams.deleteMany({})
   
   // Remove teams array from competitions
   db.competitions.updateMany({}, { $unset: { teams: "" } })
   ```

## Need Help?

If you encounter issues:
1. Check server logs for errors
2. Check MongoDB for data consistency
3. Verify all scripts ran successfully
4. Make sure server is restarted with new code
