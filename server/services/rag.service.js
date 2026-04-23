// ─────────────────────────────────────────────────────────────
//  rag.service.js — RAG-lite: Direct Database Retrieval with Smart Filtering
// ─────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

const transactionToText = (tx) => {
  const date = tx.date
    ? new Date(tx.date).toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'unknown date';
  const amount = `₹${tx.amount.toLocaleString('en-IN')}`;
  return `${tx.type === 'income' ? 'Received' : 'Spent'} ${amount} on ${date} | Category: ${tx.category || 'Uncategorized'} | Desc: ${tx.description || 'N/A'}`;
};

const buildFinancialContext = async (userId, question = '') => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const queryFilter = { user: userObjectId };

  // SMART RETRIEVAL: Lightweight semantic filtering based on question
  const q = question.toLowerCase();
  if (q) {
    if (q.includes('food') || q.includes('eat') || q.includes('restaurant')) {
      queryFilter.category = { $regex: /food|dining/i };
    }
    if (q.includes('income') || q.includes('earn') || q.includes('salary')) {
      queryFilter.type = 'income';
    }
    if (q.includes('month') || q.includes('recent')) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0,0,0,0);
      queryFilter.date = { $gte: startOfMonth };
    }
  }

  // Fetch up to 100 transactions to keep payload safe
  const transactions = await Transaction.find(queryFilter)
    .sort({ date: -1 })
    .limit(100)
    .lean();

  if (!transactions.length) {
    return { context: null, transactions: [] };
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryTotals = {};

  transactions.forEach(tx => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
      const cat = tx.category || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
    }
  });

  const topCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, total]) => `  - ${cat}: ₹${total.toFixed(2)}`)
    .join('\n');

  const recentTxText = transactions
    .slice(0, 10)
    .map((tx, i) => `  ${i + 1}. ${transactionToText(tx)}`)
    .join('\n');

  const context = `User Financial Summary (Filtered by query relevance):
- Total Income: ₹${totalIncome.toFixed(2)}
- Total Expense: ₹${totalExpenses.toFixed(2)}
- Net Savings: ₹${(totalIncome - totalExpenses).toFixed(2)}

Top spending categories:
${topCategories || '  None'}

Recent relevant transactions:
${recentTxText || '  None'}`;

  return { context, transactions };
};

// Stub for existing routes so they don't break
const indexTransactions = async () => ({ indexed: 0 });

module.exports = { buildFinancialContext, indexTransactions };
