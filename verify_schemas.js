import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from './models/Admin.js';
import Customer from './models/Customer.js';
import DeliveryRecord from './models/DeliveryRecord.js';

// Load environment config
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/water-cms';

async function runVerification() {
  console.log(`\x1b[36m%s\x1b[0m`, `🔍 Starting Schema Verification Script...`);
  console.log(`Connecting to: ${MONGO_URI}`);

  try {
    // 1. Connect to Mongo
    await mongoose.connect(MONGO_URI);
    console.log(`\x1b[32m✔ Connected to MongoDB successfully.\x1b[0m\n`);

    // 2. Clear previous verification datasets
    console.log(`🧹 Clearing previous verification collections...`);
    await Admin.deleteMany({});
    await Customer.deleteMany({});
    await DeliveryRecord.deleteMany({});
    console.log(`✔ Collections purged.\n`);

    // 3. Create Mock Admin
    console.log(`👤 Inserting Mock Admin account...`);
    const mockAdmin = await Admin.create({
      name: 'Rohan Sharma',
      email: 'rohan.sharma@hydroflow.com',
      mobile: '9876543210',
      password: 'super_secure_hash_password_123',
      role: 'admin',
    });
    console.log(`\x1b[32m✔ Admin Created:\x1b[0m ID: ${mockAdmin._id}, Name: ${mockAdmin.name}\n`);

    // 4. Create Mock Customer linked to Admin
    console.log(`👥 Inserting Mock Customer account linked to Admin...`);
    const mockCustomer = await Customer.create({
      customerName: 'Anil Kumar',
      phoneNumber: '9123456789',
      address: {
        street: 'Flat 402, Building 4B',
        area: 'Sector 15, Green Park',
        city: 'Delhi',
        postalCode: '110016',
      },
      waterPlan: 'Premium',
      dueAmount: 450,
      totalCansSupplied: 24,
      createdBy: mockAdmin._id,
    });
    console.log(`\x1b[32m✔ Customer Created:\x1b[0m ID: ${mockCustomer._id}, Plan: ${mockCustomer.waterPlan}\n`);

    // 5. Create Mock Delivery Record linked to Customer & Admin
    console.log(`🚚 Inserting Mock Delivery Record...`);
    const mockDelivery = await DeliveryRecord.create({
      customer: mockCustomer._id,
      numberOfCans: 3,
      amountCharged: 120,
      status: 'Delivered',
      deliveredBy: mockAdmin._id,
      notes: 'Delivered directly to flat door. Paid via UPI.',
    });
    console.log(`\x1b[32m✔ Delivery Record Created:\x1b[0m ID: ${mockDelivery._id}, Cans: ${mockDelivery.numberOfCans}\n`);

    // 6. Test Model Relations / Population
    console.log(`🔗 Verifying relational populates...`);
    const populatedDelivery = await DeliveryRecord.findById(mockDelivery._id)
      .populate('customer', 'customerName phoneNumber')
      .populate('deliveredBy', 'name role');
    
    console.log(`Populated Delivery Detail:`);
    console.log(`  - Customer: ${populatedDelivery.customer.customerName} (${populatedDelivery.customer.phoneNumber})`);
    console.log(`  - Delivered By: ${populatedDelivery.deliveredBy.name} (${populatedDelivery.deliveredBy.role})`);
    console.log(`\x1b[32m✔ Relational populates verified successfully.\x1b[0m\n`);

    // 7. Verify Schema Validations (Catch failure)
    console.log(`🚨 Testing constraint boundaries (creating invalid customer phone number)...`);
    try {
      await Customer.create({
        customerName: 'Invalid Client',
        phoneNumber: '12345', // FAILS: Must be 10-digit Indian mobile number
        address: {
          street: 'Test Street',
          area: 'Test Area',
          postalCode: '110001',
        },
        createdBy: mockAdmin._id,
      });
      console.log(`\x1b[31m✖ Validation Test Failed: Customer created with invalid phone number!\x1b[0m`);
    } catch (validationErr) {
      console.log(`\x1b[32m✔ Validation Caught Expected Error:\x1b[0m ${validationErr.message}`);
    }

  } catch (error) {
    console.error(`\x1b[31m✖ Schema Verification Failure: ${error.message}\x1b[0m`);
  } finally {
    // Disconnect connection
    await mongoose.disconnect();
    console.log(`\n🔌 Disconnected from MongoDB. Verification complete.`);
  }
}

runVerification();
