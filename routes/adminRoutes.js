import express from 'express';
import { getAdmins, addAdmin, deleteAdmin } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All admin management routes require an active 'admin' session
router.route('/')
  .get(protect, authorize('admin'), getAdmins)
  .post(protect, authorize('admin'), addAdmin);

router.route('/:id')
  .delete(protect, authorize('admin'), deleteAdmin);

export default router;
