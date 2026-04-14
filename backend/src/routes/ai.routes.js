const express = require('express');
const router = express.Router();
const {
  askQuestion,
  querySchema,
  insightSchema,
  indexUserTransactions,
  getInsights,
} = require('../controllers/ai.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// Ask a specific RAG question
router.post('/ask', protect, validate(querySchema), askQuestion);

// Re-index user transactions
router.post('/index', protect, indexUserTransactions);

// Get proactive insights
router.post('/insights', protect, validate(insightSchema), getInsights);

module.exports = router;
