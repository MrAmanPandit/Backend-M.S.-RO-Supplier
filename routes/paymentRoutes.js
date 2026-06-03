import express from 'express';
import { submitPayment, getPaymentHistory, getAdvanceLedger } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, submitPayment);
router.get('/history', protect, getPaymentHistory);
router.get('/advance-ledger', protect, getAdvanceLedger);

export default router;
