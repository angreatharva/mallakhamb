/**
 * Test Mocks Index
 *
 * Re-exports all mock factories for convenient importing.
 *
 * Usage:
 *   const { createMockPlayerRepository, createMockEmailService } = require('../mocks');
 */

const repositoryMocks = require('./repository.mock');
const serviceMocks = require('./service.mock');
const emailMock = require('./email.mock');

module.exports = {
  ...repositoryMocks,
  ...serviceMocks,
  ...emailMock,
};
