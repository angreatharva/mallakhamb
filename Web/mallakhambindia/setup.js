#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Sports Event Entry Web Application...\n');

// Create server/.env file
const serverEnvContent = `PORT=5000
MONGODB_URI=mongodb://localhost:27017/sports-event-app
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development`;

if (!fs.existsSync('server/.env')) {
  fs.writeFileSync('server/.env', serverEnvContent);
  console.log('✅ Created server/.env file');
} else {
  console.log('⚠️  server/.env already exists');
}

// Create root .env file
const rootEnvContent = `VITE_API_URL=http://localhost:5000/api`;

if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', rootEnvContent);
  console.log('✅ Created .env file');
} else {
  console.log('⚠️  .env already exists');
}

console.log('\n📦 Installing dependencies...\n');

try {
  // Install frontend dependencies
  console.log('Installing frontend dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Frontend dependencies installed');

  // Install backend dependencies
  console.log('\nInstalling backend dependencies...');
  execSync('cd server && npm install', { stdio: 'inherit' });
  console.log('✅ Backend dependencies installed');

} catch (error) {
  console.error('❌ Error installing dependencies:', error.message);
  process.exit(1);
}

console.log('\n🎉 Setup complete!');
console.log('\n📋 Next steps:');
console.log('1. Make sure MongoDB is running on your system');
console.log('2. Start the backend server: cd server && npm run dev');
console.log('3. Start the frontend: npm run dev');
console.log('4. Open http://localhost:5173 in your browser');
console.log('\n🔧 Environment files created:');
console.log('- server/.env (backend configuration)');
console.log('- .env (frontend configuration)');
console.log('\n⚠️  Remember to change JWT_SECRET in production!');
