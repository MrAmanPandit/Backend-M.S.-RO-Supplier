import express from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Dashboard reporting endpoint (Restricted to Staff Roles)
router.get('/stats', protect, authorize('admin', 'supervisor'), getDashboardStats);

export default router;
