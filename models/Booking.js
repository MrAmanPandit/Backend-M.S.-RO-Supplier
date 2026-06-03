import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
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
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1 camper'],
      default: 1,
    },
    address: {
      type: String,
      required: [true, 'Delivery address is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  }
);

// High-performance index for filtering bookings by status or timestamp
bookingSchema.index({ status: 1, createdAt: -1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
