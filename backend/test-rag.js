require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const { indexTransactions, askAI, generateInsights } = require('./src/services/rag.service');
const Transaction = require('./src/models/Transaction');

// Wait for a few seconds if using promises
const delay = ms => new Promise(res => setTimeout(res, ms));

async function runTest() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key') {
    console.error('❌ ERROR: You must add a valid OPENAI_API_KEY to d:\\IDP\\backend\\.env for the embedding models to work!');
    process.exit(1);
  }

  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create a mock user ID
    const dummyUserId = new mongoose.Types.ObjectId();
    console.log(`👤 Using Mock User ID: ${dummyUserId.toString()}`);

    // Generate mock transactions
    const mockTxs = [
      { user: dummyUserId, amount: 450, type: 'expense', category: 'Food & Dining', description: 'Starbucks Coffee & Sandwich', date: new Date(Date.now() - 1 * 24*60*60*1000) },
      { user: dummyUserId, amount: 2500, type: 'expense', category: 'Shopping', description: 'Nike Running Shoes', date: new Date(Date.now() - 3 * 24*60*60*1000) },
      { user: dummyUserId, amount: 8000, type: 'expense', category: 'Bills & Utilities', description: 'Electricity Bill', date: new Date(Date.now() - 5 * 24*60*60*1000) },
      { user: dummyUserId, amount: 60000, type: 'income', category: 'Salary', description: 'Monthly Salary', date: new Date(Date.now() - 7 * 24*60*60*1000) },
      { user: dummyUserId, amount: 1200, type: 'expense', category: 'Entertainment', description: 'Netflix and Spotify Subscriptions', date: new Date(Date.now() - 10 * 24*60*60*1000) },
      { user: dummyUserId, amount: 3500, type: 'expense', category: 'Food & Dining', description: 'Dinner with friends at Olive Bar', date: new Date(Date.now() - 15 * 24*60*60*1000) }
    ];

    console.log('Inserting mock transactions into DB...');
    const insertedTxs = await Transaction.insertMany(mockTxs);
    
    console.log('Indexing transactions into local FAISS store...');
    await indexTransactions(dummyUserId, insertedTxs);
    console.log('✅ Transactions vector-embedded and indexed!');

    console.log('\n=========================================');
    console.log('🤖 TEST 1: Proactive AI Insights Generation');
    console.log('=========================================');
    const insights = await generateInsights(dummyUserId, insertedTxs);
    console.log(insights.insights);

    console.log('\n=========================================');
    console.log('🤖 TEST 2: Specific Question (Ask AI)');
    console.log('=========================================');
    const query = "How much did I spend on food and dining recently, and how can I cut down?";
    console.log(`👤 Question: "${query}"`);
    console.log('⏳ Thinking...');
    
    const answer = await askAI(dummyUserId, query);
    console.log('\n🤖 Answer:');
    console.log(answer.answer);
    
    console.log('\n🧹 Cleaning up test data...');
    await Transaction.deleteMany({ user: dummyUserId });
    
    console.log('✅ Test complete!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTest();
