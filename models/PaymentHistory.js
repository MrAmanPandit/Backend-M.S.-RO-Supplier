import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    paymentAmount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative'],
    },
    previousDue: {
      type: Number,
      required: [true, 'Previous due is required'],
      min: [0, 'Previous due cannot be negative'],
    },
    remainingDue: {
      type: Number,
      required: [true, 'Remaining due is required'],
      min: [0, 'Remaining due cannot be negative'],
    },
    advanceAdded: {
      type: Number,
      required: [true, 'Advance added is required'],
      min: [0, 'Advance added cannot be negative'],
    },
    paymentType: {
      type: String,
      required: [true, 'Payment type is required'],
      enum: {
        values: ['due_payment', 'advance_payment', 'mixed_payment'],
        message: '{VALUE} is not a valid payment type. Must be due_payment, advance_payment, or mixed_payment',
      },
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['Cash', 'UPI', 'Cheque', 'Bank Transfer'],
        message: '{VALUE} is not a valid payment method',
      },
      default: 'Cash',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Notes cannot exceed 200 characters'],
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Creator reference (Admin) is required'],
    },
  },
  {
    timestamps: true,
  }
);

// --- Indexing Strategy ---
// 1. Compound index for customer payment logs ordered by date
paymentHistorySchema.index({ customer: 1, paymentDate: -1 });

// 2. Index for scanning global payments sorted by date
paymentHistorySchema.index({ paymentDate: -1 });

const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);

export default PaymentHistory;
