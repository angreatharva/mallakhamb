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
    
    // Find all competitions without a year field
    const competitionsWithoutYear = await Competition.find({ year: { $exists: false } }).toArray();
    
    console.log(`Found ${competitionsWithoutYear.length} competitions without year field`);
    
    if (competitionsWithoutYear.length === 0) {
      console.log('✅ All competitions already have year field');
      process.exit(0);
    }
    
    // Update each competition
    for (const comp of competitionsWithoutYear) {
      // Extract year from startDate
      const startDate = new Date(comp.startDate);
      const year = startDate.getFullYear();
      
      await Competition.updateOne(
        { _id: comp._id },
        { $set: { year: year } }
      );
      
      console.log(`✅ Updated "${comp.name}" with year ${year}`);
    }
    
    console.log(`\n✅ Successfully updated ${competitionsWithoutYear.length} competitions!`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
});
