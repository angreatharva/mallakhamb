const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

const createAdmin = async () => {
    try {
        // Connect to database (using same DB as main app)
        await mongoose.connect('mongodb://localhost:27017/BRMC');
        console.log('Connected to database: BRMC');

        const name = 'Atharva Angre';
        const email = 'angreatharva08@gmail.com';
        const password = 'Atharva08';

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: email });
        if (existingAdmin) {
            console.log('Admin user already exists!');
            console.log(`Email: ${email}`);
            console.log(`Password: ${password}`);
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
        console.log('Admin user created successfully!');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);

        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        if (error.code === 11000) {
            console.log('Admin with this email already exists!');
        }
        process.exit(1);
    }
};

createAdmin();