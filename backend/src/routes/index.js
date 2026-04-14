const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const transactionRoutes = require('./transaction.routes');
const aiRoutes = require('./ai.routes');

router.use('/auth', authRoutes);
router.use('/transactions', transactionRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
