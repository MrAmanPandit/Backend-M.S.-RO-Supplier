/**
 * Lightweight, express-native request body validators.
 * Intercepts requests and triggers 400 responses with clean descriptive logs.
 */

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Validator for Admin/Staff Registration
 */
export const validateAdminRegister = (req, res, next) => {
  const { name, email, mobile, password, role } = req.body;
  const errors = [];

  if (!name || name.trim() === '') errors.push('Name is required');

  // Email is optional — only validate format if provided
  if (email && !EMAIL_REGEX.test(email)) {
    errors.push('Please enter a valid email address');
  }

  if (!mobile) {
    errors.push('Mobile number is required');
  } else if (!INDIAN_MOBILE_REGEX.test(mobile)) {
    errors.push('Please enter a valid 10-digit mobile number starting with 6-9');
  }

  if (!password || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters long');
  }

  if (role && !['admin', 'supervisor'].includes(role)) {
    errors.push('Role must be either admin or supervisor');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors,
    });
  }

  next();
};

/**
 * Validator for Admin Login
 */
export const validateAdminLogin = (req, res, next) => {
  const { mobile, password } = req.body;
  const errors = [];

  if (!mobile) {
    errors.push('Mobile number is required');
  } else if (!INDIAN_MOBILE_REGEX.test(mobile)) {
    errors.push('Please enter a valid 10-digit mobile number');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors,
    });
  }

  next();
};

/**
 * Validator for Customer Login
 */
export const validateCustomerLogin = (req, res, next) => {
  const { phoneNumber, password } = req.body;
  const errors = [];

  if (!phoneNumber) {
    errors.push('Phone number is required');
  } else if (!INDIAN_MOBILE_REGEX.test(phoneNumber)) {
    errors.push('Please enter a valid 10-digit Indian mobile number');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors,
    });
  }

  next();
};
