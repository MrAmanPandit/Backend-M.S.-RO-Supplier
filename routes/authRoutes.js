import express from 'express';
import { 
  registerAdmin, 
  loginAdmin, 
  loginCustomer 
} from '../controllers/authController.js';
import { 
  validateAdminRegister, 
  validateAdminLogin, 
  validateCustomerLogin 
} from '../middleware/validate.js';

const router = express.Router();

// Administrative registration endpoint
router.post('/admin/register', validateAdminRegister, registerAdmin);

// Administrative login endpoint
router.post('/admin/login', validateAdminLogin, loginAdmin);

// Customer login endpoint
router.post('/customer/login', validateCustomerLogin, loginCustomer);

export default router;
