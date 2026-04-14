// ─────────────────────────────────────────────────────────────
//  ai.controller.js — Handles AI / RAG endpoints
// ─────────────────────────────────────────────────────────────
const { z } = require('zod');
const {
  askAIStream,
  indexTransactions,
  generateInsights,
  clearIndex,
} = require('../services/rag.service');
const Transaction = require('../models/Transaction');

// ── Validation schemas ──────────────────────────────────────

const querySchema = z.object({
  body: z.object({
    query: z.string().min(3, 'Query must be at least 3 characters'),
  }),
});

const insightSchema = z.object({
  body: z.object({
    // Optional: client can pass a date range to scope insights
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).optional(),
});

// ─────────────────────────────────────────────────────────────
//  POST /api/ai/ask
//  Ask a natural-language question about your transactions
// ─────────────────────────────────────────────────────────────
const askQuestion = async (req, res, next) => {
  try {
    const { query } = req.body;
    
    // Switch to streaming function
    await askAIStream(req.user.id, query, res);

  } catch (error) {
    // If headers are already sent, express next() might crash, 
    // but the stream handles internal errors.
    if (!res.headersSent) {
      next(error);
    }
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/ai/index
//  Index (or re-index) all of the authenticated user's
//  transactions into FAISS for RAG retrieval
// ─────────────────────────────────────────────────────────────
const indexUserTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Clear stale index then rebuild
    clearIndex(userId);

    const transactions = await Transaction.find({ user: userId }).sort({ date: -1 });

    if (!transactions.length) {
      return res.status(200).json({
        success: true,
        data: { indexed: 0, message: 'No transactions found to index.' },
      });
    }

    const result = await indexTransactions(userId, transactions);

    res.status(200).json({
      success: true,
      data: {
        indexed: result.indexed,
        message: `Successfully indexed ${result.indexed} transactions.`,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/ai/insights
//  Generate proactive spending insights (no question needed)
// ─────────────────────────────────────────────────────────────
const getInsights = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.body || {};

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const query = { user: userId };
    if (Object.keys(dateFilter).length) query.date = dateFilter;

    const transactions = await Transaction.find(query).sort({ date: -1 }).limit(100);

    const result = await generateInsights(userId, transactions);

    res.status(200).json({
      success: true,
      data: {
        insights: result.insights,
        sourcesUsed: result.sources,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  querySchema,
  insightSchema,
  askQuestion,
  indexUserTransactions,
  getInsights,
};
