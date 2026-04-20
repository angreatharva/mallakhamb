/**
 * Database Setup/Teardown Helpers for Tests
 *
 * Provides utilities for connecting to and cleaning up a test database.
 * Uses mongodb-memory-server when available, otherwise falls back to
 * the MONGODB_TEST_URI environment variable.
 *
 * Requirements: 15.5
 */

const mongoose = require('mongoose');

let mongoServer = null;

/**
 * Connect to the test database.
 *
 * Attempts to use an in-memory MongoDB server (mongodb-memory-server)
 * if the package is installed. Falls back to the MONGODB_TEST_URI
 * environment variable or the default test URI.
 *
 * @returns {Promise<void>}
 */
const connectTestDB = async () => {
  // If already connected, do nothing
  if (mongoose.connection.readyState === 1) {
    return;
  }

  let uri;

  try {
    // Try to use in-memory server for fully isolated tests
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();
  } catch {
    // Fall back to environment variable or default
    uri =
      process.env.MONGODB_TEST_URI ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/mallakhamb-test';
  }

  await mongoose.connect(uri, {
    // Suppress deprecation warnings in tests
  });
};

/**
 * Disconnect from the test database and stop the in-memory server
 * if one was started.
 *
 * @returns {Promise<void>}
 */
const disconnectTestDB = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

/**
 * Drop all collections in the test database.
 * Useful for resetting state between tests.
 *
 * @returns {Promise<void>}
 */
const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((col) => col.deleteMany({}))
  );
};

/**
 * Drop a specific collection by name.
 *
 * @param {string} collectionName
 * @returns {Promise<void>}
 */
const clearCollection = async (collectionName) => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  const col = mongoose.connection.collections[collectionName];
  if (col) {
    await col.deleteMany({});
  }
};

/**
 * Standard Jest lifecycle hooks for database tests.
 *
 * Usage:
 *   const { useTestDB } = require('../helpers/db.helpers');
 *   useTestDB();
 *
 * This registers beforeAll / afterAll / afterEach hooks automatically.
 */
const useTestDB = () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });
};

module.exports = {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
  clearCollection,
  useTestDB,
};
