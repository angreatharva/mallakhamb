// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const createAdmin = async () => {
    try {
        // Verify environment variable is loaded
        if (!process.env.MONGODB_URI) {
            console.error('❌ ERROR: MONGODB_URI not found in environment variables');
            console.error('Please check that Server/.env file exists and contains MONGODB_URI');
            process.exit(1);
        }

        console.log('🔗 Connecting to MongoDB...');
        
        // Connect to database (using same DB as main app)
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const name = 'Atharva Angre';
        const email = 'angreatharva02@gmail.com';
        const password = 'Atharva02';

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: email });
        if (existingAdmin) {
            console.log('⚠️  Admin user already exists!');
            console.log('Admin Details:');
            console.log(`- Name: ${existingAdmin.name}`);
            console.log(`- Email: ${email}`);
            console.log(`- Role: ${existingAdmin.role}`);
            console.log(`- Active: ${existingAdmin.isActive}`);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create admin user
        const admin = new Admin({
            name: name,
            email: email,
            password: password,
            role: 'admin'
        });

        await admin.save();
        console.log('✅ Admin user created successfully!');
        console.log('Admin Credentials:');
        console.log(`- Email: ${email}`);
        console.log(`- Password: ${password}`);
        console.log(`- Role: admin`);

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        if (error.code === 11000) {
            console.log('⚠️  Admin with this email already exists!');
        }
        await mongoose.disconnect();
        process.exit(1);
    }
};

createAdmin();