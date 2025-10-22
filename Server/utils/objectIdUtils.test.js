const mongoose = require('mongoose');
const {
  convertToObjectId,
  isValidObjectId,
  convertMultipleToObjectId,
  createObjectIdError,
  validateAndConvertObjectId
} = require('./objectIdUtils');

// Simple test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('Running ObjectId Utilities Tests...\n');
    
    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✓ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\nTest Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

// Test helper functions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(message || `Expected not to equal ${expected}, got ${actual}`);
  }
}

// Create test runner instance
const runner = new TestRunner();

// Test data
const validObjectIdString = '507f1f77bcf86cd799439011';
const validObjectId = new mongoose.Types.ObjectId(validObjectIdString);
const invalidObjectIdString = 'invalid-id';
const shortString = '123';
const longString = '507f1f77bcf86cd799439011abc';

// Tests for isValidObjectId function
runner.test('isValidObjectId - should return true for valid ObjectId string', () => {
  const result = isValidObjectId(validObjectIdString);
  assert(result === true, 'Should return true for valid ObjectId string');
});

runner.test('isValidObjectId - should return true for valid ObjectId object', () => {
  const result = isValidObjectId(validObjectId);
  assert(result === true, 'Should return true for valid ObjectId object');
});

runner.test('isValidObjectId - should return false for invalid string', () => {
  const result = isValidObjectId(invalidObjectIdString);
  assert(result === false, 'Should return false for invalid ObjectId string');
});

runner.test('isValidObjectId - should return false for null', () => {
  const result = isValidObjectId(null);
  assert(result === false, 'Should return false for null');
});

runner.test('isValidObjectId - should return false for undefined', () => {
  const result = isValidObjectId(undefined);
  assert(result === false, 'Should return false for undefined');
});

runner.test('isValidObjectId - should return false for empty string', () => {
  const result = isValidObjectId('');
  assert(result === false, 'Should return false for empty string');
});

runner.test('isValidObjectId - should return false for short string', () => {
  const result = isValidObjectId(shortString);
  assert(result === false, 'Should return false for short string');
});

runner.test('isValidObjectId - should return false for long string', () => {
  const result = isValidObjectId(longString);
  assert(result === false, 'Should return false for long string');
});

// Tests for convertToObjectId function
runner.test('convertToObjectId - should convert valid string to ObjectId', () => {
  const result = convertToObjectId(validObjectIdString);
  assert(result !== null, 'Should not return null for valid string');
  assert(result instanceof mongoose.Types.ObjectId, 'Should return ObjectId instance');
  assertEqual(result.toString(), validObjectIdString, 'Should match original string');
});

runner.test('convertToObjectId - should return ObjectId as is', () => {
  const result = convertToObjectId(validObjectId);
  assert(result !== null, 'Should not return null for valid ObjectId');
  assert(result instanceof mongoose.Types.ObjectId, 'Should return ObjectId instance');
  assertEqual(result.toString(), validObjectIdString, 'Should match original ObjectId');
});

runner.test('convertToObjectId - should return null for invalid string', () => {
  const result = convertToObjectId(invalidObjectIdString);
  assert(result === null, 'Should return null for invalid string');
});

runner.test('convertToObjectId - should return null for null input', () => {
  const result = convertToObjectId(null);
  assert(result === null, 'Should return null for null input');
});

runner.test('convertToObjectId - should return null for undefined input', () => {
  const result = convertToObjectId(undefined);
  assert(result === null, 'Should return null for undefined input');
});

runner.test('convertToObjectId - should return null for empty string', () => {
  const result = convertToObjectId('');
  assert(result === null, 'Should return null for empty string');
});

// Tests for convertMultipleToObjectId function
runner.test('convertMultipleToObjectId - should convert array of valid strings', () => {
  const validIds = [validObjectIdString, new mongoose.Types.ObjectId().toString()];
  const result = convertMultipleToObjectId(validIds);
  assert(Array.isArray(result), 'Should return array');
  assertEqual(result.length, 2, 'Should return 2 ObjectIds');
  assert(result.every(id => id instanceof mongoose.Types.ObjectId), 'All items should be ObjectIds');
});

runner.test('convertMultipleToObjectId - should filter out invalid IDs', () => {
  const mixedIds = [validObjectIdString, invalidObjectIdString, null];
  const result = convertMultipleToObjectId(mixedIds);
  assert(Array.isArray(result), 'Should return array');
  assertEqual(result.length, 1, 'Should return 1 valid ObjectId');
  assert(result[0] instanceof mongoose.Types.ObjectId, 'Should be ObjectId instance');
});

runner.test('convertMultipleToObjectId - should return empty array for non-array input', () => {
  const result = convertMultipleToObjectId('not-an-array');
  assert(Array.isArray(result), 'Should return array');
  assertEqual(result.length, 0, 'Should return empty array');
});

runner.test('convertMultipleToObjectId - should return empty array for empty array', () => {
  const result = convertMultipleToObjectId([]);
  assert(Array.isArray(result), 'Should return array');
  assertEqual(result.length, 0, 'Should return empty array');
});

// Tests for createObjectIdError function
runner.test('createObjectIdError - should create error object with correct structure', () => {
  const fieldName = 'teamId';
  const value = 'invalid-id';
  const result = createObjectIdError(fieldName, value);
  
  assert(typeof result === 'object', 'Should return object');
  assertEqual(result.error, 'Invalid ObjectId', 'Should have correct error type');
  assertEqual(result.field, fieldName, 'Should have correct field name');
  assertEqual(result.value, value, 'Should have correct value');
  assert(result.message.includes(fieldName), 'Message should include field name');
  assert(result.message.includes(value), 'Message should include value');
  assertEqual(result.expectedFormat, '24-character hexadecimal string', 'Should have expected format');
  assert(typeof result.timestamp === 'string', 'Should have timestamp');
});

// Tests for validateAndConvertObjectId function
runner.test('validateAndConvertObjectId - should succeed for valid ObjectId string', () => {
  const result = validateAndConvertObjectId('teamId', validObjectIdString);
  
  assert(typeof result === 'object', 'Should return object');
  assertEqual(result.success, true, 'Should indicate success');
  assert(result.objectId instanceof mongoose.Types.ObjectId, 'Should contain ObjectId');
  assertEqual(result.originalValue, validObjectIdString, 'Should preserve original value');
});

runner.test('validateAndConvertObjectId - should fail for null value', () => {
  const result = validateAndConvertObjectId('teamId', null);
  
  assert(typeof result === 'object', 'Should return object');
  assertEqual(result.success, false, 'Should indicate failure');
  assertEqual(result.error, 'Missing Required Field', 'Should have correct error type');
  assertEqual(result.field, 'teamId', 'Should have correct field name');
});

runner.test('validateAndConvertObjectId - should fail for invalid ObjectId string', () => {
  const result = validateAndConvertObjectId('teamId', invalidObjectIdString);
  
  assert(typeof result === 'object', 'Should return object');
  assertEqual(result.success, false, 'Should indicate failure');
  assertEqual(result.error, 'Invalid ObjectId', 'Should have correct error type');
  assertEqual(result.field, 'teamId', 'Should have correct field name');
  assertEqual(result.value, invalidObjectIdString, 'Should have correct value');
});

runner.test('validateAndConvertObjectId - should fail for wrong data type', () => {
  const result = validateAndConvertObjectId('teamId', 123);
  
  assert(typeof result === 'object', 'Should return object');
  assertEqual(result.success, false, 'Should indicate failure');
  assertEqual(result.error, 'Invalid Data Type', 'Should have correct error type');
  assertEqual(result.receivedType, 'number', 'Should indicate received type');
});

// Edge case tests
runner.test('Edge case - convertToObjectId with numeric input', () => {
  const result = convertToObjectId(123);
  assert(result === null, 'Should return null for numeric input');
});

runner.test('Edge case - isValidObjectId with boolean input', () => {
  const result = isValidObjectId(true);
  assert(result === false, 'Should return false for boolean input');
});

runner.test('Edge case - convertToObjectId with object input (non-ObjectId)', () => {
  const result = convertToObjectId({ id: 'test' });
  assert(result === null, 'Should return null for plain object input');
});

// Run all tests
if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { TestRunner, assert, assertEqual, assertNotEqual };