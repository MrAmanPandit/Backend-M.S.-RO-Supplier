import PaymentHistory from '../models/PaymentHistory.js';
import Customer from '../models/Customer.js';
import { runInTransaction, syncAdvancePrepayments } from '../config/db.js';
import AdvancePayment from '../models/AdvancePayment.js';

/**
 * @desc    Submit a customer payment transaction (handles normal, full, or advance scenarios)
 * @route   POST /api/payments
 * @access  Private (Admin/Supervisor)
 */
export const submitPayment = async (req, res) => {
  try {
    const { customerId, paymentAmount: rawPaymentAmount, paymentMethod, notes } = req.body;

    if (!customerId) {
      return res.status(400).json({
        status: 'error',
        message: 'Customer ID is required',
      });
    }

    const paymentAmount = Number(rawPaymentAmount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment amount must be a valid positive number',
      });
    }

    const result = await runInTransaction(async (session) => {
      // Validate customer exists under transaction session
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Capture snapshot of balances prior to payment
      const previousDue = customer.dueAmount || 0;
      const previousAdvance = customer.advanceBalance || 0;

      let remainingDue = 0;
      let advanceAdded = 0;
      let paymentType = 'due_payment';

      if (previousDue === 0) {
        // All paid is advance
        customer.advanceBalance = Number((customer.advanceBalance + paymentAmount).toFixed(2));
        remainingDue = 0;
        advanceAdded = paymentAmount;
        paymentType = 'advance_payment';
      } else if (paymentAmount <= previousDue) {
        // Pay all or portion of dues
        customer.dueAmount = Number((previousDue - paymentAmount).toFixed(2));
        remainingDue = customer.dueAmount;
        advanceAdded = 0;
        paymentType = 'due_payment';
      } else {
        // Payment exceeds outstanding dues (mixed payment)
        const excess = Number((paymentAmount - previousDue).toFixed(2));
        customer.dueAmount = 0;
        customer.advanceBalance = Number((previousAdvance + excess).toFixed(2));
        remainingDue = 0;
        advanceAdded = excess;
        paymentType = 'mixed_payment';
      }

      // Update cumulative total paid
      customer.totalPaidAmount = Number(((customer.totalPaidAmount || 0) + paymentAmount).toFixed(2));

      // Save customer
      await customer.save({ session });

      // Create payment history record
      const paymentLog = await PaymentHistory.create([{
        customer: customerId,
        customerName: customer.customerName,
        paymentAmount,
        previousDue,
        remainingDue,
        advanceAdded,
        paymentType,
        paymentMethod: paymentMethod || 'Cash',
        notes: notes || `Payment recorded — ${paymentType.replace('_', ' ')}`,
        createdBy: req.user._id,
      }], { session });

      const createdPayment = paymentLog[0];

      // If we added to advance balance, we log a corresponding AdvancePayment document
      if (advanceAdded > 0) {
        await AdvancePayment.create([{
          customer: customerId,
          payment: createdPayment._id,
          amount: advanceAdded,
          remainingAmount: advanceAdded,
          status: 'active',
          notes: notes || `Extra payment added as advance: ₹${advanceAdded}`
        }], { session });
      }

      // Sync prepayments in FIFO sequence
      await syncAdvancePrepayments(customerId, customer.advanceBalance, session);

      return {
        payment: createdPayment,
        customer: {
          _id: customer._id,
          customerName: customer.customerName,
          dueAmount: customer.dueAmount,
          advanceBalance: customer.advanceBalance,
          totalPaidAmount: customer.totalPaidAmount,
        }
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Payment processed successfully',
      data: result,
    });
  } catch (error) {
    console.error(`\x1b[31m[Submit Payment Error] %s\x1b[0m`, error.stack);
    
    if (error.message === 'Customer not found') {
      return res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while logging payment',
    });
  }
};


/**
 * @desc    Get all payment histories or filter by specific customer
 * @route   GET /api/payments/history
 * @access  Private (Admin/Supervisor)
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const { customerId } = req.query;
    const filter = {};

    if (customerId) {
      filter.customer = customerId;
    }

    const payments = await PaymentHistory.find(filter)
      .populate('customer', 'customerName phoneNumber address')
      .populate('createdBy', 'name role')
      .sort({ paymentDate: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Payment History Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving payment records',
    });
  }
};

/**
 * @desc    Get FIFO advance payment ledger for a customer
 * @route   GET /api/payments/advance-ledger?customerId=xxx
 * @access  Private (Admin/Supervisor)
 */
export const getAdvanceLedger = async (req, res) => {
  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({
        status: 'error',
        message: 'customerId query parameter is required',
      });
    }

    const ledger = await AdvancePayment.find({ customer: customerId })
      .populate('payment', 'paymentAmount paymentDate paymentMethod paymentType')
      .sort({ createdAt: 1 })
      .lean();

    const totalActive = ledger
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + (l.remainingAmount || 0), 0);

    res.status(200).json({
      status: 'success',
      count: ledger.length,
      totalActiveAdvance: Number(totalActive.toFixed(2)),
      data: ledger,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Advance Ledger Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving advance ledger',
    });
  }
};
