/**
 * Migration Template
 * 
 * Copy this file and rename it following the convention: ###_description.js
 * Example: 001_initial_indexes.js, 002_add_user_fields.js
 * 
 * The number prefix ensures migrations run in order.
 */

/**
 * Run the migration
 * This function is called when running migrations up
 */
async function up() {
  // Add your migration logic here
  // Examples:
  
  // 1. Create indexes
  // const Model = require('../models/ModelName');
  // await Model.collection.createIndex({ fieldName: 1 });
  
  // 2. Data migration
  // const Model = require('../models/ModelName');
  // await Model.updateMany({}, { $set: { newField: 'defaultValue' } });
  
  // 3. Add compound index
  // await Model.collection.createIndex({ field1: 1, field2: -1 });
  
  console.log('Migration up completed');
}

/**
 * Rollback the migration
 * This function is called when rolling back migrations
 */
async function down() {
  // Add your rollback logic here
  // This should undo what the up() function did
  
  // Examples:
  
  // 1. Drop indexes
  // const Model = require('../models/ModelName');
  // await Model.collection.dropIndex('fieldName_1');
  
  // 2. Remove fields
  // await Model.updateMany({}, { $unset: { newField: '' } });
  
  console.log('Migration down completed');
}

module.exports = { up, down };
