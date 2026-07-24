// -------------------------------------------------------------
//  🔌 services.js — The Helpers (Sockets, AI, and Rules)
// -------------------------------------------------------------
// This file contains all our "external helper brains".
// 1. Socket.io — For sending real-time messages to the user.
// 2. Groq AI — For talking to the smart Llama-3 AI.
// 3. RAG-lite — For summarizing the database so the AI knows our spending.
// 4. Rule Engine — A checklist that auto-categorizes expenses.

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Transaction } = require('./db');

// ==========================================
// 🔌 1. Socket.io (Real-Time Communication)
// ==========================================
let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Verify who is connecting to our WebSockets!
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected to WebSocket: ${socket.user.id}`);
    
    // Put user in their own private channel room
    socket.join(socket.user.id);

    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected from WebSocket: ${socket.user.id}`);
    });
  });

  return io;
};

// Send real-time updates directly to the web page!
const notifyUser = (userId, event, data) => {
  if (io) {
    io.to(userId.toString()).emit(event, data);
  }
};


// ==========================================
// 🧠 2. Groq AI & 📚 3. RAG-Lite Context
// ==========================================
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

// Helper to turn a transaction into a readable text sentence
const transactionToText = (tx) => {
  const date = tx.date
    ? new Date(tx.date).toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'unknown date';
  const amount = `₹${tx.amount.toLocaleString('en-IN')}`;
  return `${tx.type === 'income' ? 'Received' : 'Spent'} ${amount} on ${date} | Category: ${tx.category || 'Uncategorized'} | Desc: ${tx.description || 'N/A'}`;
};

// Gathers the user's spending data and structures it for the AI to analyze
const buildFinancialContext = async (userId, question = '') => {
  let userObjectId;
  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
  } catch (e) {
    userObjectId = userId;
  }
  const queryFilter = { user: userObjectId };

  // Load transactions for user
  const transactions = await Transaction.find(queryFilter)
    .sort({ date: -1 })
    .lean();

  if (!transactions || !transactions.length) {
    return {
      context: `User Financial Summary:\n- Total Income: ₹0.00\n- Total Expense: ₹0.00\n- Net Savings: ₹0.00\n- Total Transactions: 0\n\nNo transactions logged yet.`,
      transactions: []
    };
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryTotals = {};
  const categoryCounts = {};

  transactions.forEach(tx => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
    } else {
      totalExpenses += amt;
      const cat = tx.category || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  });

  const categoryBreakdownText = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, total]) => `  - ${cat}: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${categoryCounts[cat]} item${categoryCounts[cat] > 1 ? 's' : ''})`)
    .join('\n');

  const recentTxText = transactions
    .slice(0, 50)
    .map((tx, i) => `  ${i + 1}. [${tx.type.toUpperCase()}] ₹${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Category: ${tx.category || 'Uncategorized'} | Desc: ${tx.description || 'N/A'} | Date: ${new Date(tx.date).toLocaleDateString('en-IN')}`)
    .join('\n');

  const context = `User Financial Summary:
- Total Income: ₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
- Total Expense: ₹${totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
- Net Savings: ₹${(totalIncome - totalExpenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
- Total Transactions: ${transactions.length}

Expense Breakdown by Category:
${categoryBreakdownText || '  None'}

Recent Transactions (Up to 50):
${recentTxText || '  None'}`;

  return { context, transactions };
};

const generateMockAIResponse = (context, userQuery = null, transactions = []) => {
  let income = 0;
  let expense = 0;
  
  if (context) {
    const incomeMatch = context.match(/Total Income: ₹([\d,.]+)/);
    const expenseMatch = context.match(/Total Expense: ₹([\d,.]+)/);
    if (incomeMatch) income = parseFloat(incomeMatch[1].replace(/,/g, '')) || 0;
    if (expenseMatch) expense = parseFloat(expenseMatch[1].replace(/,/g, '')) || 0;
  }

  const netSavings = income - expense;

  if (userQuery) {
    const q = userQuery.toLowerCase();

    // Check highest expense
    if (q.includes('highest') || q.includes('biggest') || q.includes('max') || q.includes('most expensive')) {
      const expenses = transactions.filter(t => t.type === 'expense');
      if (expenses.length > 0) {
        const top = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
        return `🏆 **Highest Expense:** Your single largest expense was **₹${Number(top.amount).toLocaleString('en-IN')}** for **"${top.description}"** (${top.category}) on ${new Date(top.date).toLocaleDateString('en-IN')}.`;
      }
      return `ℹ️ You don't have any logged expenses yet.`;
    }

    // Check specific categories (e.g. food, transport, shopping, housing)
    const categoryKeywords = ['food', 'dining', 'eat', 'groceries', 'transport', 'uber', 'cab', 'shopping', 'entertainment', 'housing', 'utilities', 'health', 'education'];
    const matchedKeyword = categoryKeywords.find(k => q.includes(k));
    if (matchedKeyword) {
      const regex = new RegExp(matchedKeyword, 'i');
      const matchingTx = transactions.filter(t => regex.test(t.category) || regex.test(t.description));
      const totalSpent = matchingTx.reduce((sum, t) => sum + Number(t.amount), 0);
      if (matchingTx.length > 0) {
        return `📊 **${matchedKeyword.toUpperCase()} Breakdown:**\n- Total spent: **₹${totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}** across **${matchingTx.length}** transaction(s).\n- Recent item: "${matchingTx[0].description}" (₹${Number(matchingTx[0].amount).toLocaleString('en-IN')}).`;
      } else {
        return `ℹ️ No transactions matching "${matchedKeyword}" were found in your record.`;
      }
    }

    // Check income / earnings
    if (q.includes('income') || q.includes('salary') || q.includes('earn') || q.includes('deposit')) {
      const incomeTx = transactions.filter(t => t.type === 'income');
      return `💰 **Income Overview:**\n- Total Income: **₹${income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Total Income Transactions: **${incomeTx.length}**`;
    }

    // Check savings / balance
    if (q.includes('save') || q.includes('saving') || q.includes('balance') || q.includes('net')) {
      return `💡 **Net Financial Position:**\n- Total Income: **₹${income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Total Expense: **₹${expense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Current Net Balance: **₹${netSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**`;
    }

    return `🤖 **AI Financial Assistant:**\nBased on your records:\n- Total Income: **₹${income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Total Expenses: **₹${expense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Net Balance: **₹${netSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}**\n- Recorded Transactions: **${transactions.length}**`;
  }

  const ratio = income > 0 ? (expense / income) * 100 : (expense > 0 ? 100 : 0);
  let summary = `✨ **AI Spending Insights** ✨\n\n`;
  if (ratio > 80) {
    summary += `⚠️ **High Expense Warning:** You are spending **${ratio.toFixed(1)}%** of your total income. Consider reviewing discretionary expenses to boost your savings.\n\n`;
  } else {
    summary += `🎉 **Great Financial Health:** Your expenses are **${ratio.toFixed(1)}%** of your income. You are in a strong position to build long-term savings!\n\n`;
  }
  summary += `📌 **Quick Financial Summary:**\n`;
  summary += `- **Total Income:** ₹${income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  summary += `- **Total Expense:** ₹${expense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  summary += `- **Net Balance:** ₹${netSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return summary;
};

// Requests response from Groq Llama-3 AI model
const generateInsightsFromContext = async (context, userQuery = null, transactions = []) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key') {
    return {
      insights: generateMockAIResponse(context, userQuery, transactions),
      model: 'Local Smart Financial Advisor (Fallback)',
    };
  }

  const systemPrompt = `You are a friendly, insightful personal finance chatbot. Use the user's transaction data to answer naturally and helpfully.
Answer the user's question directly, using only the provided financial summary and transaction list. Mention exact Rupee amounts (₹), category totals, and specific transaction descriptions when relevant.
Keep the tone conversational, practical, and concise, and avoid generic filler. Format responses with short bullet points or brief paragraphs.`;

  const userMessage = userQuery
    ? `Financial Data Context:\n${context}\n\nUser Question: ${userQuery}`
    : `Financial Data Context:\n${context}\n\nPlease analyze my spending and provide actionable financial insights.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    const data = await response.json();
    return {
      insights: data.choices?.[0]?.message?.content || 'No response generated.',
      model: data.model,
    };
  } catch (error) {
    console.error('[AI] Fallback to local advisor:', error.message);
    return {
      insights: generateMockAIResponse(context, userQuery, transactions),
      model: 'Local Smart Financial Advisor',
    };
  }
};

// Streams the AI output chunk by chunk (typewriter style) for a cooler chat experience
const streamInsightsFromContext = async (context, userQuery, res, transactions = []) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const mockResponse = generateMockAIResponse(context, userQuery, transactions);
    
    // Simulate streaming by splitting text into small blocks
    const tokens = mockResponse.match(/[\s\S]{1,8}/g) || [mockResponse];
    
    let index = 0;
    const sendNextToken = () => {
      if (index < tokens.length) {
        res.write(`data: ${JSON.stringify({ text: tokens[index] })}\n\n`);
        index++;
        setTimeout(sendNextToken, 15);
      } else {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    };
    sendNextToken();
    return;
  }

  const systemPrompt = `You are a friendly, insightful personal finance chatbot. Use the user's transaction data to answer naturally and helpfully.
Answer the user's question directly, using only the provided financial summary and transaction list. Mention exact Rupee amounts (₹), category totals, and specific transaction descriptions when relevant.
Keep the tone conversational, practical, and concise, and avoid generic filler. Format responses with short bullet points or brief paragraphs.`;

  const userMessage = `Financial Data Context:\n${context}\n\nUser Question: ${userQuery}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}`);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[AI Stream] Fallback:', error.message);
    const mockResponse = generateMockAIResponse(context, userQuery, transactions);
    res.write(`data: ${JSON.stringify({ text: mockResponse })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
};


// ==========================================
// 📋 4. Rule Engine (Auto-Categorizer)
// ==========================================
const checkRules = (transaction) => {
  let flags = [];
  
  // Rule 1: Flag high expenses (> 1000 rupees)
  if (transaction.type === 'expense' && transaction.amount > 1000) {
    flags.push('High value transaction');
  }

  // Rule 2: Keywords in description will auto-assign categories
  let suggestedCategory = transaction.category;
  if (!suggestedCategory || suggestedCategory === 'Uncategorized') {
    const desc = transaction.description.toLowerCase();
    if (desc.includes('coffee') || desc.includes('starbucks') || desc.includes('food') || desc.includes('pizza')) {
      suggestedCategory = 'Food & Drink';
    } else if (desc.includes('uber') || desc.includes('lyft') || desc.includes('cab') || desc.includes('metro') || desc.includes('train')) {
      suggestedCategory = 'Transportation';
    } else if (desc.includes('walmart') || desc.includes('target') || desc.includes('amazon') || desc.includes('shop')) {
      suggestedCategory = 'Shopping';
    } else if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('movie') || desc.includes('game')) {
      suggestedCategory = 'Entertainment';
    } else if (desc.includes('salary') || desc.includes('payroll') || desc.includes('intern') || desc.includes('gift')) {
      suggestedCategory = 'Income';
    }
  }

  return {
    suggestedCategory,
    flags
  };
};

module.exports = {
  initSocket,
  notifyUser,
  buildFinancialContext,
  generateInsightsFromContext,
  streamInsightsFromContext,
  checkRules,
  indexTransactions: async () => ({ indexed: 0 }) // Legacy stub
};
