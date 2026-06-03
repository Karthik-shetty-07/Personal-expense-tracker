// -------------------------------------------------------------
//  🚀 server.js — The Main Brain (Starts the web server!)
// -------------------------------------------------------------
// This is the starting line of our backend. When you run "npm run dev",
// node starts this file. It sets up express, security guards, mounts
// our routes.js, initializes websocket sockets, and listens to the port!

require('dotenv').config({ path: '../.env' }); // Load root .env file

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const path = require('path');

// Import our new unified database, routes, and middleware!
const { connectDB } = require('./db');
const routes = require('./routes');
const { initSocket } = require('./services');
const { errorHandler, notFoundHandler } = require('./middleware');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB Database
connectDB();

// Create the Express app instance
const app = express();

// 🔒 Security: Protects our server headers from common attacks
app.use(helmet());

// 🤝 CORS: Allows frontend web app to talk to backend
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// 📦 Parsers: Helps express read JSON data sent by frontend
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🧹 Cleaners: Prevents hackers from putting bad scripts into database
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// 🗜️ Compressor: Compresses data packets so the website loads faster
app.use(compression());

// 🚦 Rate Limiter: Prevents bot attacks by limiting requests to 100 per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// 🏥 Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is running and healthy!' });
});

// 🗺️ Mount all API Routes
app.use('/api', routes);

// 📁 Static files handler: Serves React frontend when in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client', 'dist', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API is running... Run in production mode to serve the React frontend page.');
  });
}

// 🧹 Error Catchers
app.use(notFoundHandler);
app.use(errorHandler);

// Create the HTTP server wrapper
const server = http.createServer(app);

// Initialize Socket.io WebSockets
initSocket(server);

// Start listening for web visitors!
server.listen(PORT, () => {
  console.log(`🚀 Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// If there's an unhandled promise crash, shut down gracefully
process.on('unhandledRejection', (err) => {
  console.log(`💥 Critical Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
