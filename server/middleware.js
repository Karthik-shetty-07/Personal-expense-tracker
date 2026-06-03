// -------------------------------------------------------------
//  🛡️ middleware.js — The Security Guards & Helpers
// -------------------------------------------------------------
// Think of middleware like security guards standing at the doors. 
// They check if visitors are logged in, make sure inputs are clean, 
// and clean up any mess (errors) that happen in the server.

const jwt = require('jsonwebtoken');
const { User } = require('./db');

// 🔑 1. The Token Guard: Checks if the user is logged in
const protect = async (req, res, next) => {
  let token;

  // Check if there is an "Authorization: Bearer <TOKEN>" header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Decode the token using our secret key
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Recognize dummy user instantly
      if (decoded.id === 'dummy_admin_id_12345') {
        req.user = {
          id: 'dummy_admin_id_12345',
          _id: 'dummy_admin_id_12345',
          name: 'Dummy Admin',
          email: 'admin@example.com',
          role: 'admin',
          preferences: { currency: 'USD', language: 'en' }
        };
      } else {
        // Find the user who owns this token (without loading their password)
        req.user = await User.findById(decoded.id).select('-password');
      }
      
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not found in our records!' });
      }

      return next(); // Everything looks good! Let them pass to the next file/action.
    } catch (error) {
      console.error('❌ Token verification failed:', error.message);
      return res.status(401).json({ success: false, message: 'Invalid token, access denied!' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Please log in first!' });
  }
};

// 📋 2. The Input Validator: Checks if the user sent correct information
const validate = (schema) => async (req, res, next) => {
  try {
    // Run the check against the request's body, query parameters, or URL variables
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return next(); // Input is clean! Let it proceed.
  } catch (error) {
    if (error.name === 'ZodError') {
      // Map out all input mistakes to send back to the user
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid information provided!',
        errors: messages
      });
    }
    return res.status(500).json({ success: false, message: 'Internal validation failure.' });
  }
};

// 🧹 3. The Error Handler: Catches errors so our server doesn't crash!
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  console.error('💥 Server caught an error:', err);

  // If MongoDB receives a bad ID (like requesting /api/transactions/12345)
  if (err.name === 'CastError') {
    error = { message: 'Resource not found', statusCode: 404 };
  }

  // If MongoDB complains about a duplicate (like registering an email already in use)
  if (err.code === 11000) {
    error = { message: 'That email is already registered!', statusCode: 400 };
  }

  // If Mongoose validations fail
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Something went wrong inside the server!'
  });
};

// 🗺️ 4. The "No Route" Handler: For when users go to a URL that doesn't exist
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Oops! That web address does not exist!'
  });
};

module.exports = {
  protect,
  validate,
  errorHandler,
  notFoundHandler
};
