import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import connectDB from './config/db.js';

// Load environment variables from .env
dotenv.config();

// Establish connection to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security Headers Middleware
app.use(helmet());

// Cross-Origin Resource Sharing Middleware
app.use(cors({
  origin: NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

// HTTP Request Logger Middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import deliveryRoutes from './routes/deliveryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import { protect, authorize } from './middleware/auth.js';

// Body Parsing Middleware (JSON and URL-encoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Core API Router Mountings
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bookings', bookingRoutes);

// Standard Health-Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Water Supply CMS Backend API is running smoothly.',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Secure Test Endpoint (Requires Active Token Session)
app.get('/api/protected/health-secure', protect, (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Access granted! Secure database session active.',
    user: req.user
  });
});

// Secure Admin-Only Test Endpoint (Requires Admin Role)
app.get('/api/protected/admin-only', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Access granted! Staff administrator clearance verified.',
    user: req.user
  });
});


// Fallback Route (404 Not Found)
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot find ${req.originalUrl} on this server.`
  });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`\x1b[31m[Error Handled] %s\x1b[0m`, err.stack);
  
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    stack: NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start listening for connections
app.listen(PORT, () => {
  console.log(`\x1b[36m%s\x1b[0m`, `🚀 Server listening in ${NODE_ENV} mode on http://localhost:${PORT}`);
});
