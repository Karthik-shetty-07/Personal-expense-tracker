// -------------------------------------------------------------
//  🗺️ routes.js — The Map (URLs and what they do!)
// -------------------------------------------------------------
// Think of this file like a list of instructions. It maps URLs 
// (like /api/auth/login) to the code that handles it. There's 
// no jumping between files — everything is right here in one place!

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const jwt = require('jsonwebtoken');

// Import our DB Models and Helpers
const { User, Transaction } = require('./db');
const { protect, validate } = require('./middleware');
const { 
  checkRules, 
  notifyUser, 
  buildFinancialContext, 
  generateInsightsFromContext, 
  streamInsightsFromContext,
  indexTransactions
} = require('./services');

// 🔑 Helper: Generate JWT token for log ins
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

// ==========================================
// 📋 1. INPUT CHECKERS (ZOD SCHEMAS)
// ==========================================
const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
  })
});

const transactionSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    type: z.enum(['income', 'expense']),
    category: z.string().optional(),
    description: z.string().min(1, 'Description is required').max(200, 'Description too long'),
    date: z.string().datetime().optional()
  })
});

const querySchema = z.object({
  body: z.object({
    question: z.string().min(3, 'Question must be at least 3 characters'),
  }),
});


// ==========================================
// 👤 2. AUTHENTICATION ROUTES (LOG IN & SIGN UP)
// ==========================================

// 📝 SIGN UP (Create new account)
// POST /api/auth/register
router.post('/auth/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists!' });
    }

    // Save user in DB
    const user = await User.create({ name, email, password });

    res.status(201).json({
      success: true,
      data: {
        _id: user.id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    next(error);
  }
});

// 🔑 LOG IN (Access existing account)
// POST /api/auth/login
router.post('/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Look for user email and explicitly select password to compare
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      res.json({
        success: true,
        data: {
          _id: user._id || user.id,
          name: user.name,
          email: user.email,
          token: generateToken(user._id || user.id)
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials!' });
    }
  } catch (error) {
    next(error);
  }
});

// 👤 GET PROFILE (Who am I?)
// GET /api/auth/me
router.get('/auth/me', protect, async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: req.user });
  } catch (error) {
    next(error);
  }
});


// ==========================================
// 💰 3. TRANSACTION ROUTES (EXPENSES & INCOME)
// ==========================================

// 📂 LIST ALL TRANSACTIONS
// GET /api/transactions
router.get('/transactions', protect, async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ date: -1 });
    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    next(error);
  }
});

// ➕ ADD A TRANSACTION
// POST /api/transactions
router.post('/transactions', protect, validate(transactionSchema), async (req, res, next) => {
  try {
    const { amount, type, description, category, date } = req.body;
    
    let finalCategory = category;

    // Run rules engine if category wasn't chosen!
    if (!category || category === 'Uncategorized') {
      const { suggestedCategory } = checkRules({ amount, type, description, category });
      finalCategory = suggestedCategory;
    }
    
    const transaction = await Transaction.create({
      user: req.user.id,
      amount,
      type,
      description,
      category: finalCategory,
      date: date ? new Date(date) : Date.now()
    });

    // Notify client in real-time
    notifyUser(req.user.id, 'new_transaction', transaction);

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
});

// ❌ DELETE A TRANSACTION
// DELETE /api/transactions/:id
router.delete('/transactions/:id', protect, async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Verify user owns transaction!
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    await transaction.deleteOne();

    // Notify client in real-time to remove it from screen
    notifyUser(req.user.id, 'delete_transaction', transaction._id);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
});


// ==========================================
// 🧠 4. AI & INSIGHT ROUTES (CHATBOT & SUMMARY)
// ==========================================

// 📈 GET AUTOMATED INSIGHTS
// GET /api/ai/insights
router.route('/ai/insights')
  .get(protect, async (req, res, next) => {
    try {
      const { context, transactions } = await buildFinancialContext(req.user.id);
      const result = await generateInsightsFromContext(context, null, transactions);
      res.status(200).json({ success: true, data: { insights: result.insights, model: result.model } });
    } catch (error) {
      next(error);
    }
  })
  .post(protect, async (req, res, next) => {
    try {
      const { context, transactions } = await buildFinancialContext(req.user.id);
      const result = await generateInsightsFromContext(context, null, transactions);
      res.status(200).json({ success: true, data: { insights: result.insights, model: result.model } });
    } catch (error) {
      next(error);
    }
  });

// 🙋 ASK AI (CHATBOT INLINE QUESTION)
// POST /api/ai/query
router.post('/ai/query', protect, validate(querySchema), async (req, res, next) => {
  try {
    const { question } = req.body;
    const { context, transactions } = await buildFinancialContext(req.user.id, question);
    const result = await generateInsightsFromContext(context, question, transactions);
    res.status(200).json({ success: true, data: { answer: result.insights, model: result.model } });
  } catch (error) {
    next(error);
  }
});

// ⚡ ASK AI STREAM (REAL-TIME STREAMING CHATBOT)
// POST /api/ai/ask
router.post('/api/ai/ask', protect, async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required.' });
    }
    const { context, transactions } = await buildFinancialContext(req.user.id, query);
    await streamInsightsFromContext(context, query, res, transactions);
  } catch (error) {
    next(error);
  }
});

// Root API test route
router.get('/', (req, res) => {
  res.json({ message: 'API root working ✅' });
});

module.exports = router;
