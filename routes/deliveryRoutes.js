import express from 'express';
import { 
  addDelivery, 
  getDeliveryHistory, 
  updateDelivery,
  getDailyCustomers,
  logDailyDelivery,
  getCustomerCalendar,
} from '../controllers/deliveryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Delivery transaction endpoints
router.post('/', protect, addDelivery);
router.get('/history', protect, getDeliveryHistory);
router.put('/:id', protect, updateDelivery);

// Daily delivery update page endpoints
router.get('/daily-customers', protect, getDailyCustomers);
router.post('/daily-update', protect, logDailyDelivery);

// Customer self-service calendar endpoint
router.get('/calendar', protect, getCustomerCalendar);

export default router;

