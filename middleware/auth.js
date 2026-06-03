import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Customer from '../models/Customer.js';

/**
 * Protect middleware: Verifies JWT Bearer token and binds authenticated entity to req.user.
 */
export const protect = async (req, res, next) => {
  let token;

  if (req.query && req.query.token) {
    token = req.query.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Get token from header: "Bearer <token>"
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'temporary_development_secret_key_12345');

      // Fetch user from DB based on role claim
      if (decoded.role === 'customer') {
        req.user = await Customer.findById(decoded.id).select('-password');
      } else {
        req.user = await Admin.findById(decoded.id).select('-password');
      }

      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Not authorized, active profile not found in database',
        });
      }

      // Store decoded token claims for role matching
      req.tokenClaims = decoded;
    } catch (error) {
      console.error(`\x1b[31m[JWT Verification Failure] %s\x1b[0m`, error.message);
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, token verification failed',
      });
    }
    
    return next();
  }

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Not authorized, no Bearer token provided in authorization headers',
    });
  }
};

/**
 * Authorize middleware: Restricts routes to specified roles.
 * E.g., authorize('admin') or authorize('admin', 'supervisor')
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.tokenClaims || !req.tokenClaims.role) {
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden, authentication claims missing',
      });
    }

    if (!allowedRoles.includes(req.tokenClaims.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden, role '${req.tokenClaims.role}' is not authorized to access this resource`,
      });
    }

    next();
  };
};
