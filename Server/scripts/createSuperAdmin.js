// Load environment variables FIRST with correct path
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');

const createSuperAdmin = async () => {
  try {
    // Verify environment variable is loaded
    if (!process.env.MONGODB_URI) {
      console.error('❌ ERROR: MONGODB_URI not found in environment variables');
      console.error('Please check that Server/.env file exists and contains MONGODB_URI');
      console.error('\nExpected file location: Server/.env');
      console.error('Expected content: MONGODB_URI=mongodb://localhost:27017/mallakhamb');
      process.exit(1);
    }

    console.log('🔗 Connecting to MongoDB...');
    console.log('📍 Database:', process.env.MONGODB_URI.split('/').pop());

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Super Admin credentials. The same variables and defaults as seedApi.js, which signs in with
    // them right after this step: a password overridden on one side only made `setup:api` stop at
    // "admin" (found by the nightly e2e run, deploy/oci/PLAN.md O14, which uses a fresh one each night).
    const passwordFromEnv = Boolean(process.env.SEED_SUPERADMIN_PASSWORD);
    const superAdminData = {
      name: 'Atharva Angre',
      email: process.env.SEED_SUPERADMIN_EMAIL || 'Superadmin@gmail.com',
      password: process.env.SEED_SUPERADMIN_PASSWORD || 'Superadmin@2026',
      role: 'superadmin',
      isActive: true
    };

    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ email: superAdminData.email });

    if (existingSuperAdmin) {
      console.log('⚠️  Super Admin already exists with email:', superAdminData.email);
      console.log('Super Admin Details:');
      console.log('- Name:', existingSuperAdmin.name);
      console.log('- Email:', existingSuperAdmin.email);
      console.log('- Role:', existingSuperAdmin.role);
      console.log('- Active:', existingSuperAdmin.isActive);
      console.log('\n💡 You can use these credentials to login:');
      console.log('- Email:', superAdminData.email);
      console.log('- Password: (use your current password)');
    } else {
      // Create super admin
      console.log('📝 Creating super admin...');
      const superAdmin = new Admin(superAdminData);
      await superAdmin.save();

      console.log('✅ Super Admin created successfully!');
      console.log('Super Admin Credentials:');
      console.log('- Email:', superAdminData.email);
      console.log('- Password:', passwordFromEnv ? '(from SEED_SUPERADMIN_PASSWORD)' : superAdminData.password);
      console.log('- Role:', superAdminData.role);
      console.log('\n⚠️  Please change the password after first login!');
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    console.error('\nFull error:', error);

    if (error.code === 11000) {
      console.log('\n⚠️  Duplicate key error - Super admin might already exist');
    }

    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }

    process.exit(1);
  }
};

// Run the script
createSuperAdmin();
