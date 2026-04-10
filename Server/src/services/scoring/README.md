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

- `calculateExecutionAverage(judgeScores)` - Calculate execution average by removing highest and lowest scores from judges 1-4
- `calculateFinalScore(playerScore)` - Calculate final score (averageMarks - deduction - otherDeduction)
- `calculateRankings(playerScores)` - Calculate rankings with tie handling
- `calculateAverage(scores)` - Calculate simple average of scores
- `calculateTimeDeduction(time, maxTime, deductionRate)` - Calculate time deduction for performances over time limit
- `shouldApplyBaseScore(judgeScores, tolerance)` - Determine if base score should be applied based on judge score range
- `calculateCompletePlayerScore(playerScoreData, options)` - Calculate all score components for a player
- `calculateTeamTotal(playerScores)` - Calculate team total from player scores

**Calculation Logic:**

**Execution Average:**
- Takes scores from judge1, judge2, judge3, judge4
- Sorts scores and removes highest and lowest
- Averages the middle two scores

**Base Score Application:**
- Calculates range (max - min) of execution judge scores
- If range exceeds tolerance (default 0.5), base score is applied
- Otherwise, execution average is used

**Time Deduction:**
- Supports both numeric seconds and "MM:SS" format
- Default max time: 90 seconds
- Default deduction rate: 0.1 per second over limit
- Formula: (timeInSeconds - maxTime) * deductionRate

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
