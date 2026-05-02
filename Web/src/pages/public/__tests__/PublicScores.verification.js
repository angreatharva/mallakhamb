/**
 * Verification script for PublicScores component
 * Tests that public endpoints work without authentication
 * 
 * Requirements: 3.7, 3.8
 */

import axios from 'axios';
import apiConfig from '../../../utils/apiConfig';

const BASE_URL = apiConfig.getBaseUrl();

/**
 * Verify that public endpoints do not require authentication
 */
export const verifyPublicEndpoints = async () => {
  const results = {
    getTeams: { passed: false, error: null },
    getScores: { passed: false, error: null },
    noAuthTokenSent: { passed: false, error: null },
    no401Errors: { passed: false, error: null },
  };

  // Create a clean axios instance without any interceptors
  const testApi = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add request interceptor to verify no auth token is sent
  let authTokenSent = false;
  testApi.interceptors.request.use((config) => {
    if (config.headers.Authorization) {
      authTokenSent = true;
    }
    return config;
  });

  try {
    // Test 1: GET /api/public/teams
    console.log('Testing GET /api/public/teams...');
    const teamsResponse = await testApi.get('/public/teams');
    
    if (teamsResponse.status === 200) {
      results.getTeams.passed = true;
      console.log('✓ GET /api/public/teams works without authentication');
    }
  } catch (error) {
    results.getTeams.error = error.message;
    if (error.response?.status === 401) {
      results.no401Errors.error = 'GET /api/public/teams returned 401';
    }
    console.error('✗ GET /api/public/teams failed:', error.message);
  }

  try {
    // Test 2: GET /api/public/scores with query params
    console.log('Testing GET /api/public/scores...');
    const scoresResponse = await testApi.get('/public/scores', {
      params: {
        teamId: 'test-team-id',
        gender: 'Male',
        ageGroup: 'Under10',
      },
    });
    
    if (scoresResponse.status === 200) {
      results.getScores.passed = true;
      console.log('✓ GET /api/public/scores works without authentication');
    }
  } catch (error) {
    results.getScores.error = error.message;
    if (error.response?.status === 401) {
      results.no401Errors.error = 'GET /api/public/scores returned 401';
    }
    console.error('✗ GET /api/public/scores failed:', error.message);
  }

  // Test 3: Verify no auth token was sent
  if (!authTokenSent) {
    results.noAuthTokenSent.passed = true;
    console.log('✓ No authentication token was sent in requests');
  } else {
    results.noAuthTokenSent.error = 'Authorization header was present in requests';
    console.error('✗ Authorization header was present in requests');
  }

  // Test 4: Verify no 401 errors occurred
  if (!results.no401Errors.error) {
    results.no401Errors.passed = true;
    console.log('✓ No 401 authentication errors occurred');
  } else {
    console.error('✗ 401 authentication errors occurred');
  }

  return results;
};

/**
 * Run verification and display results
 */
export const runVerification = async () => {
  console.log('='.repeat(60));
  console.log('PublicScores Component Verification');
  console.log('Testing Requirements 3.7, 3.8');
  console.log('='.repeat(60));
  console.log('');

  const results = await verifyPublicEndpoints();

  console.log('');
  console.log('='.repeat(60));
  console.log('Verification Results:');
  console.log('='.repeat(60));
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${test}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  });

  const allPassed = Object.values(results).every(r => r.passed);
  
  console.log('');
  console.log('='.repeat(60));
  if (allPassed) {
    console.log('✓ All verification tests passed!');
  } else {
    console.log('✗ Some verification tests failed');
  }
  console.log('='.repeat(60));

  return allPassed;
};

// Allow running from command line
if (typeof window === 'undefined') {
  runVerification().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}
