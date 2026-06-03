import express from 'express';
import { 
  addCustomer, 
  getCustomers, 
  getCustomerById, 
  updateCustomer, 
  deleteCustomer,
  updateCustomerDues
} from '../controllers/customerController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Root customer endpoints
router.post('/', protect, addCustomer);
router.get('/', protect, getCustomers);

// Single customer details and adjustments
router.get('/:id', protect, getCustomerById);
router.put('/:id', protect, updateCustomer);
router.delete('/:id', protect, authorize('admin'), deleteCustomer); // Only Admins can delete client profiles
router.put('/:id/dues', protect, updateCustomerDues);

export default router;
