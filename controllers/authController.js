import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Customer from '../models/Customer.js';

/**
 * Sign compact JWT token with credentials claims.
 */
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'temporary_development_secret_key_12345',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * @desc    Register a new staff member (Admin / Supervisor)
 * @route   POST /api/auth/admin/register
 * @access  Public (For demo, usually protected by Admin)
 */
export const registerAdmin = async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    // Check if admin email already exists
    const emailExists = await Admin.findOne({ email });
    if (emailExists) {
      return res.status(400).json({
        status: 'error',
        message: 'A staff member with this email address is already registered',
      });
    }

    // Check if admin mobile already exists
    const mobileExists = await Admin.findOne({ mobile });
    if (mobileExists) {
      return res.status(400).json({
        status: 'error',
        message: 'A staff member with this mobile number is already registered',
      });
    }

    // Create Admin (Pre-save hook will automatically hash the password)
    const admin = await Admin.create({
      name,
      email,
      mobile,
      password,
      role: role || 'supervisor',
    });

    res.status(201).json({
      status: 'success',
      message: 'Staff account registered successfully',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        token: generateToken(admin._id, admin.role),
      },
    });
  } catch (error) {
    console.error(`\x1b[31m[Register Admin Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during registration',
    });
  }
};

/**
 * @desc    Login admin/staff member
 * @route   POST /api/auth/admin/login
 * @access  Public
 */
export const loginAdmin = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Find admin by mobile number
    const admin = await Admin.findOne({ mobile });
    if (!admin) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid mobile number or password',
      });
    }

    // Check if account is active
    if (!admin.isActive) {
      return res.status(403).json({
        status: 'error',
        message: 'This staff account has been deactivated. Please contact support.',
      });
    }

    // Check password
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid mobile number or password',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data: {
        id: admin._id,
        name: admin.name,
        mobile: admin.mobile,
        role: admin.role,
        token: generateToken(admin._id, admin.role),
      },
    });
  } catch (error) {
    console.error(`\x1b[31m[Login Admin Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during login',
    });
  }
};

/**
 * @desc    Login Customer using Phone Number & Password
 * @route   POST /api/auth/customer/login
 * @access  Public
 */
export const loginCustomer = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Find customer by phone number
    const customer = await Customer.findOne({ phoneNumber });
    if (!customer) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid phone number or password',
      });
    }

    // Check password
    const isMatch = await customer.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid phone number or password',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Customer logged in successfully',
      data: {
        id: customer._id,
        customerName: customer.customerName,
        phoneNumber: customer.phoneNumber,
        waterPlan: customer.waterPlan,
        role: 'customer',
        token: generateToken(customer._id, 'customer'),
      },
    });
  } catch (error) {
    console.error(`\x1b[31m[Login Customer Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during customer login',
    });
  }
};
