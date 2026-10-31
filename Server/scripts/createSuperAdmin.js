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

    // There is exactly ONE Super Admin, the owner (docs/superadmin-control-plan.md).
    //   --transfer-to <email>  hands ownership to an existing ADMIN account; the
    //                          current owner becomes a plain admin.
    const transferIdx = process.argv.indexOf('--transfer-to');
    const owner = await Admin.findOne({ role: 'superadmin' });

    if (transferIdx !== -1) {
      const to = String(process.argv[transferIdx + 1] || '').trim().toLowerCase();
      const heir = to && await Admin.findOne({ email: to });
      if (!heir) {
        console.error(`❌ No admin account with email ${to || '(missing)'}. Create it as an admin first.`);
        await mongoose.disconnect();
        process.exit(1);
      }
      if (owner && String(owner._id) === String(heir._id)) {
        console.log(`✅ ${to} is already the Super Admin.`);
      } else {
        // Demote first: the single-owner index allows one superadmin at a time.
        if (owner) await Admin.updateOne({ _id: owner._id }, { $set: { role: 'admin' } });
        await Admin.updateOne({ _id: heir._id }, { $set: { role: 'superadmin', isActive: true } });
        console.log(`✅ Ownership moved${owner ? ` from ${owner.email}` : ''} to ${to}.`);
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    if (owner && owner.email !== superAdminData.email.toLowerCase()) {
      console.error(`❌ A Super Admin already exists (${owner.email}). There can be only one.`);
      console.error('   To hand ownership over: node scripts/createSuperAdmin.js --transfer-to <admin email>');
      await mongoose.disconnect();
      process.exit(1);
    }

    const existingSuperAdmin = owner;

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
