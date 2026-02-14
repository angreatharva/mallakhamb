const mongoose = require('mongoose');

const judgeSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: [true, 'Competition is required']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female'],
    required: [true, 'Gender is required']
  },
  ageGroup: {
    type: String,
    enum: ['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'],
    required: [true, 'Age group is required']
  },
  judgeNo: {
    type: Number,
    required: [true, 'Judge number is required'],
    min: 1,
    max: 5
  },
  judgeType: {
    type: String,
    enum: ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'],
    required: [true, 'Judge type is required']
  },
  name: {
    type: String,
    default: '',
    trim: true
  },
  username: {
    type: String,
    default: '',
    trim: true,
    lowercase: true,
    sparse: true // This allows multiple empty values while maintaining uniqueness for non-empty values
  },
  password: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: false // Default to false, will be set to true when judge has data
  }
}, {
  timestamps: true
});

// Compound index to ensure unique judge assignments per gender/age group/competition
judgeSchema.index({ gender: 1, ageGroup: 1, judgeNo: 1, competition: 1 }, { unique: true });
judgeSchema.index({ gender: 1, ageGroup: 1, judgeType: 1, competition: 1 }, { unique: true });

// Unique index for username per competition, but only for non-empty usernames
judgeSchema.index({ username: 1, competition: 1 }, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { username: { $ne: '' } }
});

module.exports = mongoose.model('Judge', judgeSchema);