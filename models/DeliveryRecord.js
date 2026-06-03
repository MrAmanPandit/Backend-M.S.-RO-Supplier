import mongoose from 'mongoose';

const deliveryRecordSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
    },
    customerName: {
      type: String,
      trim: true,
    },
    deliveryDate: {
      type: Date,
      default: Date.now,
    },
    deliveryDateString: {
      type: String,
      required: [true, 'deliveryDateString in YYYY-MM-DD format is required'],
    },
    numberOfCans: {
      type: Number,
      required: [true, 'Number of cans is required'],
      min: [1, 'Must supply at least 1 water can'],
    },
    amountCharged: {
      type: Number,
      required: [true, 'Amount charged is required'],
      min: [0, 'Amount charged cannot be negative'],
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: [0, 'Delivery charge cannot be negative'],
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: [0, 'Total amount cannot be negative'],
    },
    previousDue: {
      type: Number,
      default: 0,
    },
    previousAdvance: {
      type: Number,
      default: 0,
    },
    dueAmountAfterDelivery: {
      type: Number,
      default: 0,
      min: [0, 'Due amount after delivery cannot be negative'],
    },
    advanceBalanceAfterDelivery: {
      type: Number,
      default: 0,
      min: [0, 'Advance balance after delivery cannot be negative'],
    },
    status: {
      type: String,
      enum: {
        values: ['delivered', 'not_delivered', 'pending', 'cancelled', 'Delivered', 'Not Delivered', 'Pending', 'Cancelled'],
        message: '{VALUE} is not a valid status.',
      },
      default: 'delivered',
    },
    deliveredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Deliverer reference (Admin/Staff) is required'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Notes cannot exceed 200 characters'],
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// --- Indexing Strategy for 1000 Users Scale ---
// 1. Compound Index: Find all deliveries for a specific customer sorted by delivery date (newest first)
deliveryRecordSchema.index({ customer: 1, deliveryDate: -1 });

// 2. Single-Field Index: Look up delivery logs for any given day
deliveryRecordSchema.index({ deliveryDate: -1 });

// 3. Compound Index: Look up a customer's delivery for a specific date (non-unique, allows cancelled + active)
deliveryRecordSchema.index({ customer: 1, deliveryDateString: 1, status: 1 });

const DeliveryRecord = mongoose.model('DeliveryRecord', deliveryRecordSchema);

export default DeliveryRecord;
