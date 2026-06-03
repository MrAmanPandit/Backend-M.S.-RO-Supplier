import mongoose from 'mongoose';

const advancePaymentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentHistory',
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Advance amount is required'],
      min: [0, 'Advance amount cannot be negative'],
    },
    remainingAmount: {
      type: Number,
      required: [true, 'Remaining amount is required'],
      min: [0, 'Remaining amount cannot be negative'],
    },
    status: {
      type: String,
      enum: ['active', 'exhausted', 'reverted'],
      default: 'active',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Notes cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast FIFO querying per customer ordered by creation date
advancePaymentSchema.index({ customer: 1, createdAt: 1 });
advancePaymentSchema.index({ status: 1 });

const AdvancePayment = mongoose.model('AdvancePayment', advancePaymentSchema);

export default AdvancePayment;
