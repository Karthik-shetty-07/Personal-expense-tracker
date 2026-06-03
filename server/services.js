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
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const queryFilter = { user: userObjectId };

  // If user asks a question, filter our transactions to only send relevant ones!
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

  // Load up to 100 transactions to keep memory clean
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

  const context = `User Financial Summary:
- Total Income: ₹${totalIncome.toFixed(2)}
- Total Expense: ₹${totalExpenses.toFixed(2)}
- Net Savings: ₹${(totalIncome - totalExpenses).toFixed(2)}

Top spending categories:
${topCategories || '  None'}

Recent relevant transactions:
${recentTxText || '  None'}`;

  return { context, transactions };
};

const generateMockAIResponse = (context, userQuery = null) => {
  let income = 0;
  let expense = 0;
  
  if (context) {
    const incomeMatch = context.match(/Total Income: ₹([\d.]+)/);
    const expenseMatch = context.match(/Total Expense: ₹([\d.]+)/);
    if (incomeMatch) income = parseFloat(incomeMatch[1]);
    if (expenseMatch) expense = parseFloat(expenseMatch[1]);
  }

  const netSavings = income - expense;
  
  if (userQuery) {
    const q = userQuery.toLowerCase();
    if (q.includes('food') || q.includes('eat') || q.includes('starbucks') || q.includes('coffee')) {
      return `🍕 **Food & Drink Review:** Based on your logs, you've spent some money on food and drinks. Try cooking at home or preparing your own coffee to save up to 40% this month!`;
    }
    if (q.includes('save') || q.includes('budget') || q.includes('reduce')) {
      return `💡 **Saving Strategy:** Your current net savings are ₹${netSavings.toLocaleString('en-IN')}. To boost this, try setting a weekly spending limit of ₹1,000 for leisure and entertainment.`;
    }
    if (q.includes('income') || q.includes('salary') || q.includes('earn')) {
      return `💰 **Income Overview:** You earned ₹${income.toLocaleString('en-IN')} recently. Consistent income streams are great! Keep tracking to plan your next investments.`;
    }
    return `🤖 **Mock AI Financial Advisor:** You asked: "${userQuery}". Since the Groq API is in sandbox/fallback mode, here is some general advice: Your net savings are ₹${netSavings.toLocaleString('en-IN')}. Try categorized budgeting to keep expenses in check!`;
  }
  
  const ratio = income > 0 ? (expense / income) * 100 : 100;
  let summary = `✨ **AI Spending Insights (Simulation)** ✨\n\n`;
  if (ratio > 80) {
    summary += `⚠️ **High Spending Alert:** You are spending **${ratio.toFixed(1)}%** of your total income. Try pausing non-essential shopping to build a bigger emergency fund!\n\n`;
  } else {
    summary += `🎉 **Healthy Budgeting:** You are saving a solid portion of your income! Keep it up.\n\n`;
  }
  summary += `📌 **Action Steps:**\n`;
  summary += `1. Limit dining out this weekend.\n`;
  summary += `2. Put ₹2,000 into a high-yield savings account if possible.\n`;
  summary += `3. Track every small transaction to avoid subscription leaks!`;
  
  return summary;
};

// Requests response from Groq Llama-3 AI model
const generateInsightsFromContext = async (context, userQuery = null) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key') {
    return {
      insights: generateMockAIResponse(context, userQuery),
      model: `${GROQ_MODEL} (Mock Fallback)`,
    };
  }

  const systemPrompt = `You are a smart financial assistant analyzing a user's expense data.
Provide concise insights, actionable advice, and anomaly detection if possible.`;

  const userMessage = userQuery
    ? `Context:\n${context}\n\nQuestion: ${userQuery}`
    : `Context:\n${context}\n\nPlease analyze my spending and provide actionable insights.`;

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
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API returned ${response.status}`);
    }

    const data = await response.json();
    return {
      insights: data.choices?.[0]?.message?.content || 'No insights generated.',
      model: data.model,
    };
  } catch (error) {
    console.error('[AI] Error:', error.message);
    throw new Error('Failed to generate insights from Groq.');
  }
};

// Streams the AI output chunk by chunk (typewriter style) for a cooler chat experience
const streamInsightsFromContext = async (context, userQuery, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const mockResponse = generateMockAIResponse(context, userQuery);
    
    // Simulate streaming by splitting text into small blocks
    const tokens = mockResponse.match(/[\s\S]{1,8}/g) || [mockResponse];
    
    let index = 0;
    const sendNextToken = () => {
      if (index < tokens.length) {
        res.write(`data: ${JSON.stringify({ text: tokens[index] })}\n\n`);
        index++;
        setTimeout(sendNextToken, 20); // 20ms delay per token
      } else {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    };
    sendNextToken();
    return;
  }

  const systemPrompt = `You are a smart financial assistant analyzing a user's expense data.
Provide concise insights, actionable advice, and anomaly detection if possible.`;
  const userMessage = `Context:\n${context}\n\nQuestion: ${userQuery}`;

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
        temperature: 0.3,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API returned ${response.status}`);
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
    console.error('[AI Stream] Error:', error.message);
    res.write(`data: ${JSON.stringify({ text: '❌ Failed to stream response from AI.' })}\n\n`);
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
