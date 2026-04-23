// ─────────────────────────────────────────────────────────────
//  ai.controller.js — Handles AI insight endpoints
// ─────────────────────────────────────────────────────────────
const { z } = require('zod');
const { buildFinancialContext } = require('../services/rag.service');
const { generateInsightsFromContext } = require('../services/ai.service');

const querySchema = z.object({
  body: z.object({
    question: z.string().min(3, 'Question must be at least 3 characters'),
  }),
});

const getInsights = async (req, res, next) => {
  try {
    const { context } = await buildFinancialContext(req.user.id);
    if (!context) {
      return res.status(200).json({ success: true, data: { insights: 'No financial data available yet.' } });
    }
    const result = await generateInsightsFromContext(context);
    res.status(200).json({ success: true, data: { insights: result.insights, model: result.model } });
  } catch (error) {
    next(error);
  }
};

const queryInsights = async (req, res, next) => {
  try {
    const { question } = req.body;
    const { context } = await buildFinancialContext(req.user.id, question);
    if (!context) {
      return res.status(200).json({ success: true, data: { answer: 'No financial data available yet.' } });
    }
    const result = await generateInsightsFromContext(context, question);
    res.status(200).json({ success: true, data: { answer: result.insights, model: result.model } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getInsights, queryInsights, querySchema };
