const express = require('express');
const router = express.Router();

// IMPORT ROUTES
const authRoutes = require('./auth.routes');
const transactionRoutes = require('./transaction.routes');
const aiRoutes = require('./ai.routes');

// MOUNT ROUTES
router.use('/auth', authRoutes);
router.use('/transactions', transactionRoutes);
router.use('/', aiRoutes);

// TEST ROUTE
router.get('/', (req, res) => {
    res.json({ message: 'API root working ✅' });
});

module.exports = router;