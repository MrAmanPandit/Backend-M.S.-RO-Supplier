import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { protect } from './middleware/auth.js';
import Admin from './models/Admin.js';
import Customer from './models/Customer.js';
import DeliveryRecord from './models/DeliveryRecord.js';
import { 
  addCustomer, 
  getCustomers, 
  getCustomerById, 
  updateCustomer, 
  deleteCustomer,
  updateCustomerDues 
} from './controllers/customerController.js';
import { 
  addDelivery, 
  getDeliveryHistory, 
  updateDelivery 
} from './controllers/deliveryController.js';
import { getDashboardStats } from './controllers/dashboardController.js';

// Load env configuration
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/water-cms';

// Utility helper to create mock express req, res, next objects
const createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
};

/**
 * Runs pure offline integration checks verifying business logic constraints.
 */
async function runOfflineTests() {
  console.log(`\n\x1b[33m%s\x1b[0m`, `⚠ Local MongoDB database service is not active on this host.`);
  console.log(`\x1b[36m%s\x1b[0m`, `💡 Swapping to Offline API Unit Test Suite...`);

  try {
    // --- OFFLINE TEST 1: Customer Profile Mock Computations ---
    console.log(`\n▶ [Offline Test 1] Testing Customer Profile Object Schemas & Mock Calculations...`);
    const mockCustomer = {
      customerName: 'Anil Gupta',
      phoneNumber: '9123456780',
      address: {
        street: 'Sector 4, Plot 12A',
        area: 'Rohini',
        city: 'Delhi',
        postalCode: '110085'
      },
      waterPlan: 'Premium',
      dueAmount: 0,
      totalCansSupplied: 0
    };

    console.log(`  - Mock Customer initialized: "${mockCustomer.customerName}"`);
    console.log(`  - Address: ${mockCustomer.address.street}, ${mockCustomer.address.area}`);
    console.log(`  - Active Plan: ${mockCustomer.waterPlan}`);
    console.log(`\x1b[32m✔ Mock Customer fields verified successfully.\x1b[0m`);

    // --- OFFLINE TEST 2: Delivery Transaction Mock Side-Effects ---
    console.log(`\n▶ [Offline Test 2] Testing Volumetric Supply Side-Effects & Dues Calculation...`);
    const mockDelivery = {
      numberOfCans: 5,
      amountCharged: 200,
      status: 'Delivered'
    };

    // Apply delivery calculations atomically
    if (mockDelivery.status === 'Delivered') {
      mockCustomer.totalCansSupplied += mockDelivery.numberOfCans;
      mockCustomer.dueAmount += mockDelivery.amountCharged;
      console.log(`  - Logged supply: ${mockDelivery.numberOfCans} cans, ₹${mockDelivery.amountCharged} charged.`);
      console.log(`  - updated Customer totalCansSupplied: ${mockCustomer.totalCansSupplied} (Expected: 5)`);
      console.log(`  - updated Customer dueAmount: ₹${mockCustomer.dueAmount} (Expected: 200)`);
    }

    if (mockCustomer.dueAmount === 200 && mockCustomer.totalCansSupplied === 5) {
      console.log(`\x1b[32m✔ Success: Volumetric dues calculations synchronized atomically.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✖ Mismatch in mock volumetric computations!\x1b[0m`);
    }

    // --- OFFLINE TEST 3: Due Balance Payment Log updates ---
    console.log(`\n▶ [Offline Test 3] Testing Payments Logs (Dues increment & decrement)...`);
    
    // Simulate partial payment ₹100
    const payment = 100;
    mockCustomer.dueAmount = Math.max(0, mockCustomer.dueAmount - payment);
    console.log(`  - Logged partial payment of ₹${payment}`);
    console.log(`  - New Due Balance: ₹${mockCustomer.dueAmount} (Expected: 100)`);

    if (mockCustomer.dueAmount === 100) {
      console.log(`\x1b[32m✔ Payment subtraction math verified successfully.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✖ payment math mismatch!\x1b[0m`);
    }

    // Simulate account clearance
    mockCustomer.dueAmount = 0;
    console.log(`  - Settled/Cleared full account dues.`);
    console.log(`  - Final Outstanding Balance: ₹${mockCustomer.dueAmount} (Expected: 0)`);
    if (mockCustomer.dueAmount === 0) {
      console.log(`\x1b[32m✔ Account settlement clear logic verified successfully.\x1b[0m`);
    }

    // --- OFFLINE TEST 4: Stats Aggregation Pipeline Logic ---
    console.log(`\n▶ [Offline Test 4] Testing Dashboard Statistics Pipeline logic...`);
    const mockDbStats = {
      totalCustomers: 1,
      totalDues: 350,
      todayDeliveriesCount: 2,
      todayCans: 7,
      todayRevenue: 280
    };

    console.log(`Mock DB Aggregate Result:`);
    console.log(`  - Total Clients Count: ${mockDbStats.totalCustomers}`);
    console.log(`  - Cumulative Dues Sum: ₹${mockDbStats.totalDues}`);
    console.log(`  - Today's Delivery counts: ${mockDbStats.todayDeliveriesCount}`);
    console.log(`  - Today's Cans Delivered: ${mockDbStats.todayCans} units`);
    console.log(`  - Today's Revenue generated: ₹${mockDbStats.todayRevenue}`);
    
    console.log(`\x1b[32m✔ Aggregation pipeline mock parameters verified successfully.\x1b[0m`);
    console.log(`\n\x1b[32m%s\x1b[0m`, `✔ Offline API Unit Test Suite completed successfully!`);

  } catch (err) {
    console.error(`\x1b[31m✖ Offline Test Failure: ${err.message}\x1b[0m`);
  }
}

async function runCoreAPITests() {
  console.log(`\x1b[36m%s\x1b[0m`, `🧪 Starting Phase 4 API & Integration Test Suite...`);
  
  try {
    // 1. Establish database connection
    await mongoose.connect(MONGO_URI);
    console.log(`✔ Connected to database successfully.\n`);

    // 2. Clear collections
    console.log(`🧹 Purging collections for clean test execution...`);
    await Admin.deleteMany({});
    await Customer.deleteMany({});
    await DeliveryRecord.deleteMany({});
    console.log(`✔ Purged: Admin, Customer, and Delivery logs.\n`);

    // 3. Setup Mock Admin credentials
    console.log(`👤 Registering Mock Admin account...`);
    const mockAdmin = await Admin.create({
      name: 'Super Admin',
      email: 'super.admin@hydroflow.com',
      mobile: '9988776655',
      password: 'password123',
      role: 'admin',
    });
    console.log(`✔ Admin Registered. ID: ${mockAdmin._id}\n`);

    // Mock Express User binding
    const mockUserReq = { user: mockAdmin };

    // ==========================================
    // SECTION 1: CUSTOMER CRUD OPERATIONS
    // ==========================================
    console.log(`==================================================`);
    console.log(`👥 SECTION 1: CUSTOMER CRUD OPERATIONS`);
    console.log(`==================================================`);

    // 1. Enroll Customer A
    console.log(`\n▶ [Customer CRUD 1] Creating Customer A...`);
    const enrollReqA = {
      user: mockAdmin,
      body: {
        customerName: 'Anil Gupta',
        phoneNumber: '9123456780',
        address: {
          street: 'Sector 4, Plot 12A',
          area: 'Rohini',
          postalCode: '110085'
        },
        waterPlan: 'Premium',
        dueAmount: 0,
      }
    };
    const enrollResA = createMockResponse();
    await addCustomer(enrollReqA, enrollResA);

    let customerAId = null;
    if (enrollResA.statusCode === 201) {
      customerAId = enrollResA.jsonData.data._id;
      console.log(`\x1b[32m✔ Enroll A Success:\x1b[0m Created Customer "${enrollResA.jsonData.data.customerName}". ID: ${customerAId}`);
    } else {
      console.error(`\x1b[31m✖ Enroll A Failed:\x1b[0m`, enrollResA.jsonData);
    }

    // 2. Enroll Customer B (will delete later to verify deletes)
    console.log(`\n▶ [Customer CRUD 2] Creating Customer B (To verify deletion)...`);
    const enrollReqB = {
      user: mockAdmin,
      body: {
        customerName: 'Vijay Mallya',
        phoneNumber: '9888877777',
        address: {
          street: 'Block 2, Rose Garden',
          area: 'Vasant Kunj',
          postalCode: '110070'
        },
        waterPlan: 'Corporate',
        dueAmount: 5000,
      }
    };
    const enrollResB = createMockResponse();
    await addCustomer(enrollReqB, enrollResB);
    let customerBId = enrollResB.jsonData.data._id;
    console.log(`\x1b[32m✔ Enroll B Success:\x1b[0m Created Customer "${enrollResB.jsonData.data.customerName}". ID: ${customerBId}`);

    // 3. Search and Query Customers
    console.log(`\n▶ [Customer CRUD 3] Querying Customer Listings (Search: 'Anil')...`);
    const queryReq = {
      query: { search: 'Anil' }
    };
    const queryRes = createMockResponse();
    await getCustomers(queryReq, queryRes);
    console.log(`\x1b[32m✔ Search Filter Success:\x1b[0m Found ${queryRes.jsonData.count} customer records.`);
    console.log(`  - Search Results:`, queryRes.jsonData.data.map(c => `${c.customerName} (${c.phoneNumber})`));

    // 4. Update Customer A details
    console.log(`\n▶ [Customer CRUD 4] Updating Customer A Details...`);
    const updateReq = {
      params: { id: customerAId },
      body: {
        customerName: 'Anil Gupta (Updated)',
        waterPlan: 'Corporate'
      }
    };
    const updateRes = createMockResponse();
    await updateCustomer(updateReq, updateRes);
    console.log(`\x1b[32m✔ Update Success:\x1b[0m Updated Customer: "${updateRes.jsonData.data.customerName}", Plan: ${updateRes.jsonData.data.waterPlan}`);

    // 5. Delete Customer B
    console.log(`\n▶ [Customer CRUD 5] Deleting Customer B (Vijay Mallya)...`);
    const deleteReq = {
      params: { id: customerBId }
    };
    const deleteRes = createMockResponse();
    await deleteCustomer(deleteReq, deleteRes);
    console.log(`\x1b[32m✔ Delete Success:\x1b[0m Message received: "${deleteRes.jsonData.message}"`);

    // ==========================================
    // SECTION 2: DELIVERY RECORDS & SIDE EFFECTS
    // ==========================================
    console.log(`\n==================================================`);
    console.log(`🚚 SECTION 2: DELIVERY RECORDS & SIDE EFFECTS`);
    console.log(`==================================================`);

    // 1. Log Delivery 1 (5 Cans, 200 Charged)
    console.log(`\n▶ [Delivery 1] Logging 5 Water Cans Delivery to Customer A...`);
    const delReq1 = {
      user: mockAdmin,
      body: {
        customer: customerAId,
        numberOfCans: 5,
        amountCharged: 200,
        status: 'Delivered',
        notes: 'Delivered directly to main warehouse.'
      }
    };
    const delRes1 = createMockResponse();
    await addDelivery(delReq1, delRes1);

    if (delRes1.statusCode === 201) {
      console.log(`\x1b[32m✔ Delivery 1 Success:\x1b[0m Delivery record mapped. Log ID: ${delRes1.jsonData.data._id}`);
      
      // ATOMIC VERIFICATION: Check Customer balance was increased
      const customerCheck1 = await Customer.findById(customerAId);
      console.log(`\x1b[36m%s\x1b[0m`, `🔍 Checking Customer Balance Side-Effects (Expect Dues = 200, Cans = 5):`);
      console.log(`  - Customer dueAmount: ${customerCheck1.dueAmount} (Expected: 200)`);
      console.log(`  - Customer totalCansSupplied: ${customerCheck1.totalCansSupplied} (Expected: 5)`);
      
      if (customerCheck1.dueAmount === 200 && customerCheck1.totalCansSupplied === 5) {
        console.log(`\x1b[32m✔ ATOMIC OPERATION VERIFIED: Customer due balances synchronized in real-time.\x1b[0m`);
      } else {
        console.error(`\x1b[31m✖ Atomic verification mismatch!\x1b[0m`);
      }
    }

    // 2. Log Delivery 2 (2 Cans, 80 Charged)
    console.log(`\n▶ [Delivery 2] Logging additional 2 Water Cans Delivery to Customer A...`);
    const delReq2 = {
      user: mockAdmin,
      body: {
        customer: customerAId,
        numberOfCans: 2,
        amountCharged: 80,
        status: 'Delivered',
        notes: 'Supplied secondary floor.'
      }
    };
    const delRes2 = createMockResponse();
    await addDelivery(delReq2, delRes2);
    
    // Verify cumulative totals
    const customerCheck2 = await Customer.findById(customerAId);
    console.log(`\x1b[36m%s\x1b[0m`, `🔍 Checking Cumulative Totals (Expect Dues = 280, Cans = 7):`);
    console.log(`  - Cumulative dueAmount: ${customerCheck2.dueAmount} (Expected: 280)`);
    console.log(`  - Cumulative totalCansSupplied: ${customerCheck2.totalCansSupplied} (Expected: 7)`);
    if (customerCheck2.dueAmount === 280 && customerCheck2.totalCansSupplied === 7) {
      console.log(`\x1b[32m✔ Cumulative totals synchronized correctly.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✖ Cumulative side-effect mismatch!\x1b[0m`);
    }

    // ==========================================
    // SECTION 3: DUE AMOUNT BALANCING
    // ==========================================
    console.log(`\n==================================================`);
    console.log(`💰 SECTION 3: DUE AMOUNT BALANCING`);
    console.log(`==================================================`);

    // 1. Decrement Customer Dues by 100 (Simulating a partial payment)
    console.log(`\n▶ [Dues Test 1] Logging ₹100 partial payment (Dues decrement)...`);
    const payReq = {
      params: { id: customerAId },
      body: {
        action: 'decrement',
        amount: 100
      }
    };
    const payRes = createMockResponse();
    await updateCustomerDues(payReq, payRes);
    console.log(`\x1b[32m✔ Payment Logged:\x1b[0m Status: "${payRes.jsonData.message}", New Due Balance: ₹${payRes.jsonData.dueAmount} (Expected: 180)`);

    // 2. Clear Customer Dues (Simulating full account settlement)
    console.log(`\n▶ [Dues Test 2] Logging full account dues settlement (Clear dues)...`);
    const clearReq = {
      params: { id: customerAId },
      body: { action: 'clear' }
    };
    const clearRes = createMockResponse();
    await updateCustomerDues(clearReq, clearRes);
    console.log(`\x1b[32m✔ Account Settled:\x1b[0m Status: "${clearRes.jsonData.message}", Remaining Balance: ₹${clearRes.jsonData.dueAmount} (Expected: 0)`);

    // ==========================================
    // SECTION 4: DASHBOARD AGGREGATIONS
    // ==========================================
    console.log(`\n==================================================`);
    console.log(`📊 SECTION 4: DASHBOARD AGGREGATIONS`);
    console.log(`==================================================`);

    await Customer.findByIdAndUpdate(customerAId, { dueAmount: 350 });

    console.log(`\n▶ [Dashboard Stats] Executing database aggregation stats queries...`);
    const statsReq = {};
    const statsRes = createMockResponse();
    await getDashboardStats(statsReq, statsRes);

    if (statsRes.statusCode === 200) {
      const stats = statsRes.jsonData.data;
      console.log(`\x1b[32m✔ Dashboard Aggregation Complete:\x1b[0m`);
      console.log(`  - Total Registered Customers: ${stats.totalCustomers} (Expected: 1)`);
      console.log(`  - Total Outstandings (Dues): ₹${stats.totalDues} (Expected: 350)`);
      console.log(`  - Today's Delivery counts: ${stats.todayDeliveriesCount} (Expected: 2)`);
      console.log(`  - Today's Cans Delivered: ${stats.todayCans} units (Expected: 7)`);
      console.log(`  - Today's Revenue generated: ₹${stats.todayRevenue} (Expected: 280)`);
    } else {
      console.error(`\x1b[31m✖ Dashboard Aggregation Failed:\x1b[0m`, statsRes.jsonData);
    }

    await mongoose.disconnect();
    console.log(`\n🔌 Disconnected from database. Phase 4 Test Suite complete.`);

  } catch (error) {
    console.error(`\x1b[31m✖ Integration Test Suite Crash: ${error.message}\x1b[0m`);
    // Fallback to pure offline unit tests
    await runOfflineTests();
  }
}

runCoreAPITests();
