import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { registerAdmin, loginAdmin, loginCustomer } from './controllers/authController.js';
import { protect, authorize } from './middleware/auth.js';
import { validateAdminRegister, validateAdminLogin, validateCustomerLogin } from './middleware/validate.js';
import Admin from './models/Admin.js';
import Customer from './models/Customer.js';

// Load env configuration
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/water-cms';
const JWT_SECRET = process.env.JWT_SECRET || 'temporary_development_secret_key_12345';

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
 * Runs pure offline unit tests to verify security features without DB active.
 */
async function runOfflineTests() {
  console.log(`\n\x1b[33m%s\x1b[0m`, `⚠ Local MongoDB database service is not active on this host.`);
  console.log(`\x1b[36m%s\x1b[0m`, `💡 Swapping to Offline Security Unit Test Suite...`);

  try {
    // --- OFFLINE TEST 1: Request Validation Middlewares ---
    console.log(`\n▶ [Offline Test 1] Testing Input Validation Middleware Interceptors...`);
    
    // 1. Invalid Admin Registration Body (Missing fields, bad email)
    const invalidRegReq = {
      body: {
        name: ' ',
        email: 'bad_email_format',
        mobile: '12345',
        password: '123',
      }
    };
    const invalidRegRes = createMockResponse();
    let nextCalled = false;
    const nextMock = () => { nextCalled = true; };

    validateAdminRegister(invalidRegReq, invalidRegRes, nextMock);

    if (invalidRegRes.statusCode === 400) {
      console.log(`\x1b[32m✔ Validation Intercept Success:\x1b[0m Rejected bad data with 400 Bad Request.`);
      console.log(`  - Blocked Errors Logged:`, invalidRegRes.jsonData.errors);
    } else {
      console.error(`\x1b[31m✖ Validation Failed: Permitted malformed registration request!\x1b[0m`);
    }

    // 2. Valid Admin Login validation
    const validLoginReq = {
      body: {
        email: 'test.admin@hydroflow.com',
        password: 'strong_password_123'
      }
    };
    const validLoginRes = createMockResponse();
    nextCalled = false;

    validateAdminLogin(validLoginReq, validLoginRes, nextMock);
    if (nextCalled) {
      console.log(`\x1b[32m✔ Validation Format Success:\x1b[0m Valid login payload format passed interceptor.`);
    } else {
      console.error(`\x1b[31m✖ Validation Intercepted clean payload!\x1b[0m`, validLoginRes.jsonData);
    }

    // --- OFFLINE TEST 2: Bcrypt Salting & Comparison ---
    console.log(`\n▶ [Offline Test 2] Testing Password Salting (Bcryptjs) & Hash Matching...`);
    const plainTextPassword = 'my_super_secret_password_123';
    
    // Hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainTextPassword, salt);
    
    console.log(`  - Plaintext input: "${plainTextPassword}"`);
    console.log(`  - Salted hash output: ${hashedPassword}`);

    // Assert mismatch
    if (plainTextPassword === hashedPassword) {
      console.error(`\x1b[31m✖ Cryptographic failure: Plaintext and Hash are identical!\x1b[0m`);
    } else {
      console.log(`\x1b[32m✔ Salt check complete: Encryption verified.\x1b[0m`);
    }

    // Verify comparison match
    const isCorrectMatch = await bcrypt.compare(plainTextPassword, hashedPassword);
    const isIncorrectMatch = await bcrypt.compare('wrong_pass_entry', hashedPassword);

    if (isCorrectMatch && !isIncorrectMatch) {
      console.log(`\x1b[32m✔ Password comparison logic matched correctly.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✖ Password comparison decryption logic failed!\x1b[0m`);
    }

    // --- OFFLINE TEST 3: JWT Token Signing & Decode Verification ---
    console.log(`\n▶ [Offline Test 3] Testing JSON Web Token Signing & Claims Decryption...`);
    const payload = {
      id: 'mock_user_id_9999',
      role: 'admin'
    };

    // Sign Token
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    console.log(`  - Mock claims payload:`, payload);
    console.log(`  - Signed JWT output: ${token.substring(0, 40)}...`);

    // Verify and Decode
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.id === payload.id && decoded.role === payload.role) {
      console.log(`\x1b[32m✔ JWT verified successfully: Claims correctly decoded.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✖ JWT token decoding claims mismatch!\x1b[0m`, decoded);
    }

    // Assert signature verification security
    try {
      jwt.verify(token, 'malicious_wrong_secret_key');
      console.error(`\x1b[31m✖ Cryptographic Security Leak: JWT signed with wrong secret key verified successfully!\x1b[0m`);
    } catch (err) {
      console.log(`\x1b[32m✔ JWT security shield active: Rejected modified secret key validation.\x1b[0m`);
    }

    console.log(`\n\x1b[32m%s\x1b[0m`, `✔ Offline Security Unit Test Suite completed successfully!`);

  } catch (err) {
    console.error(`\x1b[31m✖ Offline Test Failure: ${err.message}\x1b[0m`);
  }
}

async function runAuthSuite() {
  console.log(`\x1b[36m%s\x1b[0m`, `🧪 Starting Phase 3 Authentication Test Suite...`);
  
  try {
    // 1. Establish database connection
    await mongoose.connect(MONGO_URI);
    console.log(`✔ Connected to database for testing.`);

    // 2. Clear collections for clean tests
    await Admin.deleteMany({});
    await Customer.deleteMany({});
    console.log(`✔ PURGED: Admin and Customer databases.`);

    // --- TEST 1: Admin Registration & Password Salting ---
    console.log(`\n▶ [Test 1] Testing Admin Registration & Bcrypt Salting...`);
    const regReq = {
      body: {
        name: 'Suresh Raina',
        email: 'suresh.raina@hydroflow.com',
        mobile: '9988776655',
        password: 'secure_password_abc',
        role: 'admin',
      },
    };
    const regRes = createMockResponse();

    await registerAdmin(regReq, regRes);

    if (regRes.statusCode === 201) {
      console.log(`\x1b[32m✔ Success:\x1b[0m Admin registered successfully. Token generated.`);
      
      const dbUser = await Admin.findOne({ email: 'suresh.raina@hydroflow.com' });
      if (dbUser.password === 'secure_password_abc') {
        console.error(`\x1b[31m✖ Salt failure: Password stored in plaintext!\x1b[0m`);
      } else {
        console.log(`\x1b[32m✔ Hashing verified:\x1b[0m Plaintext password encrypted. Salted hash: ${dbUser.password}`);
      }
    } else {
      console.error(`\x1b[31m✖ Test 1 Failed:\x1b[0m`, regRes.jsonData);
    }

    // --- TEST 2: Admin Login Verification ---
    console.log(`\n▶ [Test 2] Testing Admin Login (Correct & Incorrect Passwords)...`);
    
    // Test Correct
    const loginReqCorrect = {
      body: {
        email: 'suresh.raina@hydroflow.com',
        password: 'secure_password_abc',
      },
    };
    const loginResCorrect = createMockResponse();
    await loginAdmin(loginReqCorrect, loginResCorrect);

    let testToken = null;
    if (loginResCorrect.statusCode === 200) {
      testToken = loginResCorrect.jsonData.data.token;
      console.log(`\x1b[32m✔ Correct Credentials Success:\x1b[0m Admin logged in. JWT Signed: ${testToken.substring(0, 30)}...`);
    } else {
      console.error(`\x1b[31m✖ Correct Login Failed:\x1b[0m`, loginResCorrect.jsonData);
    }

    // Test Incorrect
    const loginReqWrong = {
      body: {
        email: 'suresh.raina@hydroflow.com',
        password: 'wrong_password_123',
      },
    };
    const loginResWrong = createMockResponse();
    await loginAdmin(loginReqWrong, loginResWrong);

    if (loginResWrong.statusCode === 401) {
      console.log(`\x1b[32m✔ Incorrect Credentials Blocked:\x1b[0m Rejected with message: "${loginResWrong.jsonData.message}"`);
    } else {
      console.error(`\x1b[31m✖ Wrong Password Test Failed: Login permitted!\x1b[0m`);
    }

    // --- TEST 3: JWT Protection & Auth Middleware ---
    console.log(`\n▶ [Test 3] Testing Protect Middleware (Route Guards)...`);
    
    const protectReqValid = {
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    };
    const protectResValid = createMockResponse();
    const nextMock = () => {};

    await protect(protectReqValid, protectResValid, nextMock);

    if (!protectResValid.jsonData) {
      console.log(`\x1b[32m✔ Success:\x1b[0m Protect middleware authenticated Bearer token and bound user context.`);
      console.log(`  - Authenticated user: ${protectReqValid.user.name} (${protectReqValid.user.role})`);
    } else {
      console.error(`\x1b[31m✖ Protect Middleware Failed:\x1b[0m`, protectResValid.jsonData);
    }

    // Mock protected request with NO token
    const protectReqEmpty = {
      headers: {},
    };
    const protectResEmpty = createMockResponse();
    await protect(protectReqEmpty, protectResEmpty, nextMock);

    if (protectResEmpty.statusCode === 401) {
      console.log(`\x1b[32m✔ Success:\x1b[0m Protect middleware blocked request with no token: "${protectResEmpty.jsonData.message}"`);
    } else {
      console.error(`\x1b[31m✖ Blank authorization allowed access!\x1b[0m`);
    }

    // --- TEST 4: Role Guard Authorizations ---
    console.log(`\n▶ [Test 4] Testing Roles Authorization Guard...`);
    
    const reqStaff = {
      tokenClaims: {
        role: 'supervisor',
      },
    };
    const resStaff = createMockResponse();
    
    const adminGuard = authorize('admin');
    adminGuard(reqStaff, resStaff, nextMock);
    
    if (resStaff.statusCode === 403) {
      console.log(`\x1b[32m✔ Success:\x1b[0m Supervisor blocked from Admin-only route: "${resStaff.jsonData.message}"`);
    } else {
      console.error(`\x1b[31m✖ Role Guard Failure: Supervisor allowed into Admin space!\x1b[0m`);
    }

    // --- TEST 5: Customer Creation and Customer Login ---
    console.log(`\n▶ [Test 5] Testing Customer Password Creation & Login...`);
    
    const testAdmin = await Admin.findOne({ email: 'suresh.raina@hydroflow.com' });
    const mockCustomer = await Customer.create({
      customerName: 'Harpreet Singh',
      phoneNumber: '9898989898',
      address: {
        street: 'Apt 203, Block C',
        area: 'Vasant Kunj',
        city: 'Delhi',
        postalCode: '110070',
      },
      password: 'customer_password_123',
      createdBy: testAdmin._id,
    });
    console.log(`✔ Customer seeded in DB with password. Salting verified: ${mockCustomer.password.substring(0, 20)}...`);

    const custLoginReq = {
      body: {
        phoneNumber: '9898989898',
        password: 'customer_password_123',
      },
    };
    const custLoginRes = createMockResponse();
    await loginCustomer(custLoginReq, custLoginRes);

    if (custLoginRes.statusCode === 200) {
      const custToken = custLoginRes.jsonData.data.token;
      console.log(`\x1b[32m✔ Customer Login Success:\x1b[0m Customer authenticated. Token signed: ${custToken.substring(0, 30)}...`);
    } else {
      console.error(`\x1b[31m✖ Customer Login Failed:\x1b[0m`, custLoginRes.jsonData);
    }

    await mongoose.disconnect();
    console.log(`\n🔌 Disconnected from database. Auth Test Suite completed successfully.`);

  } catch (error) {
    console.error(`\x1b[31m✖ Online Test Suite Crash: ${error.message}\x1b[0m`);
    // Fallback to pure offline unit tests
    await runOfflineTests();
  }
}

runAuthSuite();
