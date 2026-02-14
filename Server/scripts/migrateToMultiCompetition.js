require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Score = require('../models/Score');
const Admin = require('../models/Admin');

// Migration configuration
const DEFAULT_COMPETITION = {
  name: 'Legacy Competition 2024',
  level: 'state',
  place: 'Default Location',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  status: 'ongoing',
  description: 'Default competition created during migration to multi-competition system'
};

// Migration statistics
const stats = {
  defaultCompetition: null,
  teams: { before: 0, after: 0, migrated: 0, errors: [] },
  judges: { before: 0, after: 0, migrated: 0, errors: [] },
  scores: { before: 0, after: 0, migrated: 0, errors: [] },
  admins: { before: 0, after: 0, migrated: 0, errors: [] }
};

/**
 * Create default competition
 */
async function createDefaultCompetition() {
  console.log('\n=== Creating Default Competition ===');
  
  try {
    // Check if default competition already exists
    let competition = await Competition.findOne({ name: DEFAULT_COMPETITION.name });
    
    if (competition) {
      console.log(`✓ Default competition already exists: ${competition._id}`);
      stats.defaultCompetition = competition;
      return competition;
    }
    
    // Get first admin to assign as creator
    const firstAdmin = await Admin.findOne();
    if (firstAdmin) {
      DEFAULT_COMPETITION.createdBy = firstAdmin._id;
      DEFAULT_COMPETITION.admins = [firstAdmin._id];
    }
    
    // Create default competition
    competition = await Competition.create(DEFAULT_COMPETITION);
    console.log(`✓ Created default competition: ${competition._id}`);
    console.log(`  Name: ${competition.name}`);
    console.log(`  Level: ${competition.level}`);
    console.log(`  Place: ${competition.place}`);
    console.log(`  Start Date: ${competition.startDate.toISOString().split('T')[0]}`);
    console.log(`  End Date: ${competition.endDate.toISOString().split('T')[0]}`);
    console.log(`  Status: ${competition.status}`);
    
    stats.defaultCompetition = competition;
    return competition;
  } catch (error) {
    console.error('✗ Failed to create default competition:', error.message);
    throw error;
  }
}

/**
 * Migrate teams to default competition
 */
async function migrateTeams(defaultCompetitionId) {
  console.log('\n=== Migrating Teams ===');
  
  try {
    // Count teams without competition field
    stats.teams.before = await Team.countDocuments({ competition: { $exists: false } });
    console.log(`Found ${stats.teams.before} teams without competition reference`);
    
    if (stats.teams.before === 0) {
      console.log('✓ No teams to migrate');
      return;
    }
    
    // Update teams in batches
    const teams = await Team.find({ competition: { $exists: false } });
    
    for (const team of teams) {
      try {
        team.competition = defaultCompetitionId;
        await team.save();
        stats.teams.migrated++;
        
        if (stats.teams.migrated % 10 === 0) {
          console.log(`  Migrated ${stats.teams.migrated}/${stats.teams.before} teams...`);
        }
      } catch (error) {
        console.error(`✗ Failed to migrate team ${team._id}:`, error.message);
        stats.teams.errors.push({
          teamId: team._id,
          teamName: team.name,
          error: error.message
        });
      }
    }
    
    // Count teams after migration
    stats.teams.after = await Team.countDocuments({ competition: { $exists: false } });
    
    console.log(`✓ Migrated ${stats.teams.migrated} teams`);
    if (stats.teams.errors.length > 0) {
      console.log(`✗ Failed to migrate ${stats.teams.errors.length} teams`);
    }
  } catch (error) {
    console.error('✗ Team migration failed:', error.message);
    throw error;
  }
}

/**
 * Migrate judges to default competition
 */
async function migrateJudges(defaultCompetitionId) {
  console.log('\n=== Migrating Judges ===');
  
  try {
    // Count judges without competition field
    stats.judges.before = await Judge.countDocuments({ competition: { $exists: false } });
    console.log(`Found ${stats.judges.before} judges without competition reference`);
    
    if (stats.judges.before === 0) {
      console.log('✓ No judges to migrate');
      return;
    }
    
    // Update judges in batches
    const judges = await Judge.find({ competition: { $exists: false } });
    
    for (const judge of judges) {
      try {
        judge.competition = defaultCompetitionId;
        
        // Handle duplicate username conflicts by appending competition suffix
        if (judge.username) {
          const existingJudge = await Judge.findOne({
            username: judge.username,
            competition: defaultCompetitionId,
            _id: { $ne: judge._id }
          });
          
          if (existingJudge) {
            const originalUsername = judge.username;
            judge.username = `${judge.username}_legacy`;
            console.log(`  ⚠ Username conflict resolved: ${originalUsername} → ${judge.username}`);
          }
        }
        
        await judge.save();
        stats.judges.migrated++;
        
        if (stats.judges.migrated % 10 === 0) {
          console.log(`  Migrated ${stats.judges.migrated}/${stats.judges.before} judges...`);
        }
      } catch (error) {
        console.error(`✗ Failed to migrate judge ${judge._id}:`, error.message);
        stats.judges.errors.push({
          judgeId: judge._id,
          judgeName: judge.name,
          error: error.message
        });
      }
    }
    
    // Count judges after migration
    stats.judges.after = await Judge.countDocuments({ competition: { $exists: false } });
    
    console.log(`✓ Migrated ${stats.judges.migrated} judges`);
    if (stats.judges.errors.length > 0) {
      console.log(`✗ Failed to migrate ${stats.judges.errors.length} judges`);
    }
  } catch (error) {
    console.error('✗ Judge migration failed:', error.message);
    throw error;
  }
}

/**
 * Migrate scores to default competition
 */
async function migrateScores(defaultCompetitionId) {
  console.log('\n=== Migrating Scores ===');
  
  try {
    // Count scores without competition field
    stats.scores.before = await Score.countDocuments({ competition: { $exists: false } });
    console.log(`Found ${stats.scores.before} scores without competition reference`);
    
    if (stats.scores.before === 0) {
      console.log('✓ No scores to migrate');
      return;
    }
    
    // Update scores in batches
    const scores = await Score.find({ competition: { $exists: false } });
    
    for (const score of scores) {
      try {
        // Validate team reference still exists
        const team = await Team.findById(score.teamId);
        if (!team) {
          console.warn(`  ⚠ Score ${score._id} references non-existent team ${score.teamId}`);
          stats.scores.errors.push({
            scoreId: score._id,
            teamId: score.teamId,
            error: 'Team reference not found'
          });
          continue;
        }
        
        score.competition = defaultCompetitionId;
        await score.save();
        stats.scores.migrated++;
        
        if (stats.scores.migrated % 10 === 0) {
          console.log(`  Migrated ${stats.scores.migrated}/${stats.scores.before} scores...`);
        }
      } catch (error) {
        console.error(`✗ Failed to migrate score ${score._id}:`, error.message);
        stats.scores.errors.push({
          scoreId: score._id,
          teamId: score.teamId,
          error: error.message
        });
      }
    }
    
    // Count scores after migration
    stats.scores.after = await Score.countDocuments({ competition: { $exists: false } });
    
    console.log(`✓ Migrated ${stats.scores.migrated} scores`);
    if (stats.scores.errors.length > 0) {
      console.log(`✗ Failed to migrate ${stats.scores.errors.length} scores`);
    }
  } catch (error) {
    console.error('✗ Score migration failed:', error.message);
    throw error;
  }
}

/**
 * Migrate admins to default competition
 */
async function migrateAdmins(defaultCompetitionId) {
  console.log('\n=== Migrating Admins ===');
  
  try {
    // Count admins without competitions field or with empty competitions array
    stats.admins.before = await Admin.countDocuments({
      $or: [
        { competitions: { $exists: false } },
        { competitions: { $size: 0 } }
      ]
    });
    console.log(`Found ${stats.admins.before} admins without competition assignments`);
    
    if (stats.admins.before === 0) {
      console.log('✓ No admins to migrate');
      return;
    }
    
    // Update admins
    const admins = await Admin.find({
      $or: [
        { competitions: { $exists: false } },
        { competitions: { $size: 0 } }
      ]
    });
    
    for (const admin of admins) {
      try {
        if (!admin.competitions) {
          admin.competitions = [];
        }
        
        // Add default competition if not already assigned
        if (!admin.competitions.includes(defaultCompetitionId)) {
          admin.competitions.push(defaultCompetitionId);
        }
        
        await admin.save();
        stats.admins.migrated++;
        
        console.log(`  ✓ Migrated admin: ${admin.email}`);
      } catch (error) {
        console.error(`✗ Failed to migrate admin ${admin._id}:`, error.message);
        stats.admins.errors.push({
          adminId: admin._id,
          adminEmail: admin.email,
          error: error.message
        });
      }
    }
    
    // Count admins after migration
    stats.admins.after = await Admin.countDocuments({
      $or: [
        { competitions: { $exists: false } },
        { competitions: { $size: 0 } }
      ]
    });
    
    console.log(`✓ Migrated ${stats.admins.migrated} admins`);
    if (stats.admins.errors.length > 0) {
      console.log(`✗ Failed to migrate ${stats.admins.errors.length} admins`);
    }
  } catch (error) {
    console.error('✗ Admin migration failed:', error.message);
    throw error;
  }
}

/**
 * Validate migration results
 */
async function validateMigration(defaultCompetitionId) {
  console.log('\n=== Validating Migration ===');
  
  const validation = {
    success: true,
    issues: []
  };
  
  try {
    // Check all teams have competition references
    const teamsWithoutCompetition = await Team.countDocuments({ competition: { $exists: false } });
    if (teamsWithoutCompetition > 0) {
      validation.success = false;
      validation.issues.push(`${teamsWithoutCompetition} teams still missing competition reference`);
    } else {
      console.log('✓ All teams have competition references');
    }
    
    // Check all judges have competition references
    const judgesWithoutCompetition = await Judge.countDocuments({ competition: { $exists: false } });
    if (judgesWithoutCompetition > 0) {
      validation.success = false;
      validation.issues.push(`${judgesWithoutCompetition} judges still missing competition reference`);
    } else {
      console.log('✓ All judges have competition references');
    }
    
    // Check all scores have competition references
    const scoresWithoutCompetition = await Score.countDocuments({ competition: { $exists: false } });
    if (scoresWithoutCompetition > 0) {
      validation.success = false;
      validation.issues.push(`${scoresWithoutCompetition} scores still missing competition reference`);
    } else {
      console.log('✓ All scores have competition references');
    }
    
    // Check all admins have competition assignments
    const adminsWithoutCompetitions = await Admin.countDocuments({
      $or: [
        { competitions: { $exists: false } },
        { competitions: { $size: 0 } }
      ]
    });
    if (adminsWithoutCompetitions > 0) {
      validation.success = false;
      validation.issues.push(`${adminsWithoutCompetitions} admins still missing competition assignments`);
    } else {
      console.log('✓ All admins have competition assignments');
    }
    
    // Validate referential integrity - check if all scores reference valid teams
    const scores = await Score.find({ competition: defaultCompetitionId });
    let invalidTeamReferences = 0;
    
    for (const score of scores) {
      const team = await Team.findById(score.teamId);
      if (!team) {
        invalidTeamReferences++;
      }
    }
    
    if (invalidTeamReferences > 0) {
      validation.success = false;
      validation.issues.push(`${invalidTeamReferences} scores reference non-existent teams`);
    } else {
      console.log('✓ All score-team references are valid');
    }
    
    // Check default competition exists and has correct data
    const competition = await Competition.findById(defaultCompetitionId);
    if (!competition) {
      validation.success = false;
      validation.issues.push('Default competition not found');
    } else {
      console.log('✓ Default competition exists and is accessible');
    }
    
    return validation;
  } catch (error) {
    console.error('✗ Validation failed:', error.message);
    validation.success = false;
    validation.issues.push(`Validation error: ${error.message}`);
    return validation;
  }
}

/**
 * Generate migration report
 */
function generateReport(validation) {
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION REPORT');
  console.log('='.repeat(60));
  
  console.log('\nDefault Competition:');
  if (stats.defaultCompetition) {
    console.log(`  ID: ${stats.defaultCompetition._id}`);
    console.log(`  Name: ${stats.defaultCompetition.name}`);
    console.log(`  Level: ${stats.defaultCompetition.level}`);
    console.log(`  Status: ${stats.defaultCompetition.status}`);
  }
  
  console.log('\nTeams:');
  console.log(`  Records without competition (before): ${stats.teams.before}`);
  console.log(`  Records migrated: ${stats.teams.migrated}`);
  console.log(`  Records without competition (after): ${stats.teams.after}`);
  console.log(`  Errors: ${stats.teams.errors.length}`);
  
  console.log('\nJudges:');
  console.log(`  Records without competition (before): ${stats.judges.before}`);
  console.log(`  Records migrated: ${stats.judges.migrated}`);
  console.log(`  Records without competition (after): ${stats.judges.after}`);
  console.log(`  Errors: ${stats.judges.errors.length}`);
  
  console.log('\nScores:');
  console.log(`  Records without competition (before): ${stats.scores.before}`);
  console.log(`  Records migrated: ${stats.scores.migrated}`);
  console.log(`  Records without competition (after): ${stats.scores.after}`);
  console.log(`  Errors: ${stats.scores.errors.length}`);
  
  console.log('\nAdmins:');
  console.log(`  Records without competitions (before): ${stats.admins.before}`);
  console.log(`  Records migrated: ${stats.admins.migrated}`);
  console.log(`  Records without competitions (after): ${stats.admins.after}`);
  console.log(`  Errors: ${stats.admins.errors.length}`);
  
  console.log('\nValidation:');
  console.log(`  Status: ${validation.success ? '✓ PASSED' : '✗ FAILED'}`);
  if (validation.issues.length > 0) {
    console.log('  Issues:');
    validation.issues.forEach(issue => console.log(`    - ${issue}`));
  }
  
  console.log('\nErrors Summary:');
  const totalErrors = stats.teams.errors.length + stats.judges.errors.length + 
                      stats.scores.errors.length + stats.admins.errors.length;
  console.log(`  Total errors: ${totalErrors}`);
  
  if (totalErrors > 0) {
    console.log('\nDetailed Errors:');
    
    if (stats.teams.errors.length > 0) {
      console.log('\n  Teams:');
      stats.teams.errors.forEach(err => {
        console.log(`    - Team ${err.teamId} (${err.teamName}): ${err.error}`);
      });
    }
    
    if (stats.judges.errors.length > 0) {
      console.log('\n  Judges:');
      stats.judges.errors.forEach(err => {
        console.log(`    - Judge ${err.judgeId} (${err.judgeName}): ${err.error}`);
      });
    }
    
    if (stats.scores.errors.length > 0) {
      console.log('\n  Scores:');
      stats.scores.errors.forEach(err => {
        console.log(`    - Score ${err.scoreId} (Team: ${err.teamId}): ${err.error}`);
      });
    }
    
    if (stats.admins.errors.length > 0) {
      console.log('\n  Admins:');
      stats.admins.errors.forEach(err => {
        console.log(`    - Admin ${err.adminId} (${err.adminEmail}): ${err.error}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(validation.success ? 'MIGRATION COMPLETED SUCCESSFULLY' : 'MIGRATION COMPLETED WITH ISSUES');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('Starting Multi-Competition Migration...');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to database');
    
    // Step 1: Create default competition
    const defaultCompetition = await createDefaultCompetition();
    
    // Step 2: Migrate teams
    await migrateTeams(defaultCompetition._id);
    
    // Step 3: Migrate judges
    await migrateJudges(defaultCompetition._id);
    
    // Step 4: Migrate scores
    await migrateScores(defaultCompetition._id);
    
    // Step 5: Migrate admins
    await migrateAdmins(defaultCompetition._id);
    
    // Step 6: Validate migration
    const validation = await validateMigration(defaultCompetition._id);
    
    // Step 7: Generate report
    generateReport(validation);
    
    // Close database connection
    await mongoose.connection.close();
    console.log('✓ Database connection closed');
    
    // Exit with appropriate code
    process.exit(validation.success ? 0 : 1);
  } catch (error) {
    console.error('\n✗ Migration failed with error:', error);
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, stats };
