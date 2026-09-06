# Scoring Services

This directory contains services for managing competition scores and performing score calculations.

## Services

### ScoringService

Handles score management operations including submission, updates, deletion, and validation.

**Dependencies:**
- ScoreRepository - Data access for scores
- CompetitionRepository - Validation of competitions
- PlayerRepository - Validation of players
- JudgeRepository - Validation of judges
- Logger - Structured logging

**Key Methods:**

- `submitScore(scoreData)` - Submit a new score with validation
- `updateScore(scoreId, updates)` - Update an existing score (if not locked)
- `deleteScore(scoreId)` - Delete a score (if not locked)
- `getScoreById(scoreId)` - Retrieve a score with populated references
- `getScoresByCompetition(competitionId, filters)` - Get all scores for a competition
- `lockScore(scoreId)` - Lock a score to prevent modifications
- `unlockScore(scoreId)` - Unlock a score to allow modifications
- `validateScoreData(scoreData)` - Validate score data structure
- `validatePlayerScores(playerScores)` - Validate player score entries

**Validation Rules:**

- Competition must exist and not be deleted
- Team ID is required
- Gender must be 'Male' or 'Female'
- Age group must be valid (Under10, Under12, Under14, Under16, Under18, Above16, Above18)
- Competition type must be valid (Competition I, II, or III)
- Judge scores must be between 0 and 10
- Execution average must be between 0 and 10
- Deductions cannot be negative
- Final score cannot be negative
- Players must exist and be active

**Business Rules:**

- Locked scores cannot be updated or deleted
- Protected fields (_id, competition, createdAt) cannot be updated

### CalculationService

Handles score calculations including averages, rankings, and final score computations.

**Dependencies:**
- Logger - Structured logging

**Key Methods:**

- `calculateFinalScore(playerScore)` - Calculate final score (averageMarks - deduction - otherDeduction)
- `calculateRankings(playerScores)` - Calculate rankings with tie handling
- `calculateAverage(scores)` - Calculate simple average of scores
- `calculateTimeDeduction(time, maxTime)` - Calculate time deduction for performances over time limit
- `calculateCompletePlayerScore(playerScoreData, options)` - Calculate all score components for a player
- `calculateTeamTotal(playerScores)` - Calculate team total from player scores

`calculateExecutionAverage` and `shouldApplyBaseScore` were removed: both treated
an absent judge as a mark of 0.00, and neither implemented the COP rule it
appeared to. The panel average and the tolerance decision belong to
`calculateIndividualScore` (`utils/scoring/calculation.util.js`), which is what
`calculateCompletePlayerScore` calls.

**Calculation Logic:**

**Execution Average** (`calculateIndividualScore`, panel-size aware):
- 3 judges — plain average of the three submitted totals. No Chief, no tolerance.
- 4 judges — the Senior Judge's mark fills the vacant fourth evaluation slot, then
  the 5-judge method runs unchanged; the Senior Judge is also the Chief the
  tolerance is measured against, so that mark is counted twice.
- 5 judges — sort the four evaluation marks, drop the highest and lowest, average
  the middle two.
- Judges who did not submit are excluded, never counted as 0.00.

**Base Score Application:**
- Compares the execution average against the Chief (Senior Judge) mark
- The tolerance comes from the COP §3.4 tiered table keyed on that average
  (0.10 at 9.00+, 0.20 at 8.00+, 0.30 at 7.00+, 0.40 at 6.00+, 0.50 at 5.00+,
  1.00 below) — see `getTolerance` in `config/cop-rules.js`
- When the gap exceeds the tolerance, `averageMarks = (executionAverage + chief) / 2`
- Does not apply to 3-judge panels

**Time Deduction:**
- Supports both numeric seconds and "MM:SS" format
- Time limit: 90 seconds (`TIME_LIMIT_SECONDS`)
- Banded, not per-second: 0.20 up to 3s over, 0.30 to 5s, 0.40 to 9s, 0.50 beyond
  — see `getTimeDeduction` in `config/cop-rules.js`

**Final Score:**
- Formula: averageMarks - deduction - otherDeduction
- Cannot be negative (minimum 0)

**Rankings:**
- Players sorted by final score descending
- Tied scores receive the same rank
- Next rank after tie skips appropriately (e.g., two players tied at rank 2, next is rank 4)

## Usage Examples

### Submitting a Score

```javascript
const scoreData = {
  competition: 'comp123',
  teamId: 'team123',
  gender: 'Male',
  ageGroup: 'Under12',
  competitionType: 'Competition I',
  playerScores: [
    {
      playerId: 'player123',
      playerName: 'John Doe',
      judgeScores: {
        seniorJudge: 8.5,
        judge1: 8.0,
        judge2: 8.2,
        judge3: 8.1,
        judge4: 8.3
      },
      time: '01:25',
      otherDeduction: 0.1
    }
  ]
};

const score = await scoringService.submitScore(scoreData);
```

### Calculating Complete Player Score

```javascript
const playerScoreData = {
  playerId: 'player123',
  judgeScores: {
    judge1: 8.0,
    judge2: 8.5,
    judge3: 7.5,
    judge4: 8.2
  },
  baseScore: 7.5,
  time: '01:35',
  otherDeduction: 0.1
};

const options = {
  tolerance: 0.5,
  maxTime: 90,
  timeDeductionRate: 0.1
};

const calculatedScore = calculationService.calculateCompletePlayerScore(
  playerScoreData,
  options
);

// Result includes:
// - executionAverage: 8.1
// - baseScoreApplied: false (range within tolerance)
// - averageMarks: 8.1
// - deduction: 0.5 (5 seconds over 90)
// - finalScore: 7.5 (8.1 - 0.5 - 0.1)
```

### Calculating Rankings

```javascript
const playerScores = [
  { playerId: 'p1', playerName: 'Player 1', finalScore: 8.5 },
  { playerId: 'p2', playerName: 'Player 2', finalScore: 9.0 },
  { playerId: 'p3', playerName: 'Player 3', finalScore: 8.5 }
];

const ranked = calculationService.calculateRankings(playerScores);

// Result:
// [
//   { playerId: 'p2', playerName: 'Player 2', finalScore: 9.0, rank: 1 },
//   { playerId: 'p1', playerName: 'Player 1', finalScore: 8.5, rank: 2 },
//   { playerId: 'p3', playerName: 'Player 3', finalScore: 8.5, rank: 2 }
// ]
```

## Testing

Unit tests are provided for both services:

```bash
# Run all scoring service tests
npm test -- Server/src/services/scoring/

# Run specific service tests
npm test -- Server/src/services/scoring/scoring.service.test.js
npm test -- Server/src/services/scoring/calculation.service.test.js
```

**Test Coverage:**
- ScoringService: 28 tests covering submission, updates, deletion, validation, and locking
- CalculationService: 33 tests covering all calculation methods and edge cases

## Requirements Mapping

- **Requirement 1.5**: Service layer implementation for scoring operations
- **Requirement 1.7**: Transaction management and business rule validation
- **Requirement 1.8**: Score validation and calculation logic
- **Requirement 15.1**: Unit test coverage for service layer
- **Requirement 15.6**: Test coverage targets met (100% for both services)

## Integration

These services are designed to be injected via the DI container:

```javascript
// In DI container registration
container.register('calculationService', (c) => 
  new CalculationService(c.resolve('logger')), 'singleton');

container.register('scoringService', (c) => 
  new ScoringService(
    c.resolve('scoreRepository'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository'),
    c.resolve('judgeRepository'),
    c.resolve('logger')
  ), 'singleton');
```

## Error Handling

Both services throw domain-specific errors:

- `ValidationError` - Invalid input data
- `NotFoundError` - Referenced entity not found
- `BusinessRuleError` - Business rule violation (e.g., locked score)

All errors are logged with appropriate context for debugging.
