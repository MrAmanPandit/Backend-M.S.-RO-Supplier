import express from 'express';
import {
  streamBookings,
  createBooking,
  getBookings,
  updateBookingStatus
} from '../controllers/bookingController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public route to create a booking from the landing page
router.post('/', createBooking);

// Protected routes for admin/staff
router.get('/stream', protect, streamBookings);
router.get('/', protect, getBookings);
router.patch('/:id', protect, updateBookingStatus);

export default router;
