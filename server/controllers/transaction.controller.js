const { z } = require('zod');
const Transaction = require('../models/Transaction');
// We will import rule engine later
const { checkRules } = require('../services/ruleEngine.service');
const { indexTransactions } = require('../services/rag.service');
const { notifyUser } = require('../services/socket.service');

// Zod schema
const transactionSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    type: z.enum(['income', 'expense']),
    category: z.string().optional(),
    description: z.string().min(1, 'Description is required').max(200, 'Description too long'),
    date: z.string().datetime().optional()
  })
});

// @desc    Get all transactions
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ date: -1 });
    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    next(error);
  }
};

// @desc    Add transaction
// @route   POST /api/transactions
// @access  Private
const addTransaction = async (req, res, next) => {
  try {
    const { amount, type, description, category, date } = req.body;
    
    let finalCategory = category;
    // Default categorisation if empty
    // Connect to Rule engine for automated categorization here if category was not explicitly provided
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

    // Background indexing
    Transaction.find({ user: req.user.id }).sort({ date: -1 })
      .then(transactions => indexTransactions(req.user.id, transactions))
      .catch(err => console.error('Background index failed:', err));

    // Emit socket event
    notifyUser(req.user.id, 'new_transaction', transaction);

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete transaction
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Make sure user owns transaction
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    await transaction.deleteOne();

    // Background indexing
    Transaction.find({ user: req.user.id }).sort({ date: -1 })
      .then(transactions => indexTransactions(req.user.id, transactions))
      .catch(err => console.error('Background index failed:', err));

    // Notify user to remove from UI
    notifyUser(req.user.id, 'delete_transaction', transaction._id);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  transactionSchema,
  getTransactions,
  addTransaction,
  deleteTransaction
};
