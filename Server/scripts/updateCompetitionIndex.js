const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mallakhamb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'Connection error:'));
db.once('open', async () => {
  console.log('Connected to MongoDB');
  
  try {
    const Competition = mongoose.connection.collection('competitions');
    
    // Get all indexes
    const indexes = await Competition.indexes();
    console.log('Current indexes:', indexes);
    
    // Drop the old unique index on name only
    try {
      await Competition.dropIndex('name_1');
      console.log('✅ Successfully dropped old index: name_1');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Index name_1 does not exist (already dropped or never created)');
      } else {
        console.error('Error dropping index:', error.message);
      }
    }
    
    // Drop the old compound index on name and year (if exists)
    try {
      await Competition.dropIndex('name_1_year_1');
      console.log('✅ Successfully dropped old index: name_1_year_1');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Index name_1_year_1 does not exist (already dropped or never created)');
      } else {
        console.error('Error dropping index:', error.message);
      }
    }
    
    // Create the new compound unique index on name, year, and place
    try {
      await Competition.createIndex({ name: 1, year: 1, place: 1 }, { unique: true });
      console.log('✅ Successfully created new compound index: name_1_year_1_place_1');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('ℹ️  Index name_1_year_1_place_1 already exists');
      } else {
        console.error('Error creating index:', error.message);
      }
    }
    
    // Show final indexes
    const finalIndexes = await Competition.indexes();
    console.log('\nFinal indexes:', finalIndexes);
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
});
