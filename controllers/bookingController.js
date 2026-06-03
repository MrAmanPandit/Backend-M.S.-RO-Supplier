import Booking from '../models/Booking.js';

let clients = [];

/**
 * @desc    Establish Server-Sent Events stream for real-time notifications
 * @route   GET /api/bookings/stream
 * @access  Private (Admin/Supervisor)
 */
export const streamBookings = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send an initial keep-alive ping
  res.write('data: {"type":"init"}\n\n');

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res
  };
  clients.push(newClient);

  // Heartbeat every 30 seconds — prevents proxy/CDN timeout & rapid browser reconnects
  const heartbeat = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients = clients.filter(c => c.id !== clientId);
  });
};

/**
 * Helper to notify all active SSE clients about a new booking event
 */
const notifyNewBooking = (booking) => {
  clients.forEach(c => {
    try {
      c.res.write(`data: ${JSON.stringify({ type: 'new_booking', booking })}\n\n`);
    } catch (err) {
      console.error('Error notifying client SSE:', err.message);
    }
  });
};

/**
 * @desc    Register a new water booking (Public from landing page)
 * @route   POST /api/bookings
 * @access  Public
 */
export const createBooking = async (req, res) => {
  try {
    const { customerName, phoneNumber, quantity, address } = req.body;

    if (!customerName || !phoneNumber || !address) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, phone number, and address are required.',
      });
    }

    const booking = await Booking.create({
      customerName,
      phoneNumber,
      quantity: Number(quantity) || 1,
      address,
      status: 'Pending',
    });

    // Notify any active staff dashboard SSE streams in real-time
    notifyNewBooking(booking);

    res.status(201).json({
      status: 'success',
      message: 'Water delivery booking registered successfully',
      data: booking,
    });
  } catch (error) {
    console.error(`\x1b[31m[Create Booking Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while saving booking',
    });
  }
};

/**
 * @desc    Get all bookings (Private for admin management)
 * @route   GET /api/bookings
 * @access  Private (Admin/Supervisor)
 */
export const getBookings = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    // Sort by newest bookings first
    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      status: 'success',
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Bookings Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving bookings',
    });
  }
};

/**
 * @desc    Update a booking status (Private for admin management)
 * @route   PATCH /api/bookings/:id
 * @access  Private (Admin/Supervisor)
 */
export const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['Pending', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid status (Pending, Completed, Cancelled) is required.',
      });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking record not found',
      });
    }

    booking.status = status;
    const updatedBooking = await booking.save();

    res.status(200).json({
      status: 'success',
      message: 'Booking status updated successfully',
      data: updatedBooking,
    });
  } catch (error) {
    console.error(`\x1b[31m[Update Booking Status Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while updating booking',
    });
  }
};
