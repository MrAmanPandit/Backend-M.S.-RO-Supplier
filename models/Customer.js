import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const customerSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [60, 'Customer name cannot exceed 60 characters'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Customer phone number is required'],
      unique: true,
      trim: true,
      match: [
        /^[6-9]\d{9}$/,
        'Please enter a valid 10-digit Indian mobile number',
      ],
    },
    address: {
      area: {
        type: String,
        required: [true, 'Area/Sector is required'],
        trim: true,
      }
    },
    password: {
      type: String,
      default: '123456', // default fallback for customers
      minlength: [6, 'Password must be at least 6 characters long'],
    },
    waterPlan: {
      type: String,
      enum: {
        values: ['Budget', 'Standard', 'Premium'],
        message: '{VALUE} is not a valid water plan. Allowed plans are: Budget, Standard, Premium',
      },
      default: 'Budget',
    },
    pricePerCan: {
      type: Number,
      min: [0, 'Price per can cannot be negative'],
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: [0, 'Delivery charge cannot be negative'],
    },
    monthlyRate: {
      type: Number,
      default: 0,
      min: [0, 'Monthly rate cannot be negative'],
    },
    dueAmount: {
      type: Number,
      default: 0,
      min: [0, 'Due amount cannot be negative'],
    },
    advanceBalance: {
      type: Number,
      default: 0,
      min: [0, 'Advance balance cannot be negative'],
    },
    totalPaidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Total paid amount cannot be negative'],
    },
    totalCansSupplied: {
      type: Number,
      default: 0,
      min: [0, 'Total cans supplied cannot be negative'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Customer creator reference (Admin) is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// NOTE: Automatic due/advance netting was intentionally removed.
// All advance-vs-due logic is handled explicitly in deliveryController.js
// and paymentController.js to ensure correct ACID-safe rollback via snapshots.

// Pre-save hook to hash password before writing to DB
customerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to verify input password against hashed DB password
customerSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// --- Indexing Strategy for 1000 Users Scale ---
// 1. Unique Index on phoneNumber is automatically created by Mongoose due to unique: true constraint.

// 2. Compound Index on area and customerName (used for sorting list queries by area)
customerSchema.index({ 'address.area': 1, customerName: 1 });

// 3. Single-Field Index on customerName (text-like matches)
customerSchema.index({ customerName: 1 });

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;

