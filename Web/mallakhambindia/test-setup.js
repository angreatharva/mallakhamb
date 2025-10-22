#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Sports Event Entry Web Application Setup...\n');

const checks = [
  {
    name: 'Frontend package.json',
    path: 'package.json',
    required: true
  },
  {
    name: 'Backend package.json',
    path: 'server/package.json',
    required: true
  },
  {
    name: 'Tailwind config',
    path: 'tailwind.config.js',
    required: true
  },
  {
    name: 'PostCSS config',
    path: 'postcss.config.js',
    required: true
  },
  {
    name: 'Server environment',
    path: 'server/.env',
    required: false
  },
  {
    name: 'Root environment',
    path: '.env',
    required: false
  },
  {
    name: 'Main App component',
    path: 'src/App.jsx',
    required: true
  },
  {
    name: 'Server entry point',
    path: 'server/server.js',
    required: true
  },
  {
    name: 'Database models',
    path: 'server/models/Player.js',
    required: true
  },
  {
    name: 'API routes',
    path: 'server/routes/playerRoutes.js',
    required: true
  }
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
  if (fs.existsSync(check.path)) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name} ${check.required ? '(REQUIRED)' : '(OPTIONAL)'}`);
    if (check.required) failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 All required files are present!');
  console.log('\n🚀 You can now start the application:');
  console.log('1. Start MongoDB');
  console.log('2. cd server && npm run dev (backend)');
  console.log('3. npm run dev (frontend)');
} else {
  console.log('\n⚠️  Some required files are missing. Please check the setup.');
  process.exit(1);
}
