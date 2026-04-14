// ─────────────────────────────────────────────────────────────
//  rag.service.js — Upgraded RAG pipeline
//  Features: Hybrid Math-Context, Streaming, Score Thresholds
// ─────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { ChatGroq } = require('@langchain/groq');
const { ChatOpenAI } = require('@langchain/openai');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence } = require('@langchain/core/runnables');
const { Document } = require('@langchain/core/documents');
const Transaction = require('../models/Transaction');
const { getEmbeddingsModel, transactionToText, transactionsToTexts } = require('./embedding.service');

const FAISS_ROOT = path.resolve(process.env.FAISS_INDEX_PATH || path.join(__dirname, '..', '..', 'faiss_store'));

const getUserIndexPath = (userId) => path.join(FAISS_ROOT, String(userId));
const indexExists = (userId) => fs.existsSync(path.join(getUserIndexPath(userId), 'faiss.index'));

const loadOrCreateStore = async (userId) => {
  const dir = getUserIndexPath(userId);
  const embeddings = getEmbeddingsModel();

  if (indexExists(userId)) {
    return FaissStore.load(dir, embeddings);
  }

  fs.mkdirSync(dir, { recursive: true });
  const store = await FaissStore.fromDocuments([], embeddings);
  await store.save(dir);
  return store;
};

const indexTransactions = async (userId, transactions) => {
  try {
    if (!transactions.length) return { indexed: 0 };
    const store = await loadOrCreateStore(userId);
    const texts = transactionsToTexts(transactions);

    const docs = transactions.map((tx, i) =>
      new Document({
        pageContent: texts[i],
        metadata: {
          userId: String(userId),
          transactionId: tx._id?.toString?.() ?? tx.id ?? `tx-${i}`,
          type: tx.type,
          amount: tx.amount,
          category: tx.category,
        },
      })
    );

    await store.addDocuments(docs);
    await store.save(getUserIndexPath(userId));
    return { indexed: docs.length };
  } catch (error) {
    console.error('[RAG] Bulk index failed:', error.message);
    throw new Error('Failed to index transactions');
  }
};

const clearIndex = (userId) => {
  const dir = getUserIndexPath(userId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
};

// ─────────────────────────────────────────────────────────────
// FEATURE 3: Relevance Threshold Retrieval
// ─────────────────────────────────────────────────────────────
const retrieveContext = async (userId, query, k = 8) => {
  if (!indexExists(userId)) return [];
  const store = await loadOrCreateStore(userId);
  
  // Get similarities and scores
  const results = await store.similaritySearchWithScore(query, k);
  
  // NOTE: FAISS score is L2 distance by default (lower is better for OpenAI).
  // We keep only results that are reasonably close (distance < threshold).
  // Adjust threshold based on embedding model if necessary.
  const distanceThreshold = 0.6; 
  
  const relevantDocs = results
    .filter(([doc, distance]) => distance <= distanceThreshold)
    .map(([doc]) => doc);
    
  return relevantDocs.length > 0 ? relevantDocs : results.map(([doc])=>doc).slice(0, 3); // rollback if empty
};

// ─────────────────────────────────────────────────────────────
// FEATURE 1: Math-Augmented Hybrid Context
// ─────────────────────────────────────────────────────────────
const getMathSummary = async (userId) => {
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const aggregation = await Transaction.aggregate([
    { $match: { user: userId, date: { $gte: currentMonthStart } } },
    { $group: { _id: { type: "$type", category: "$category" }, totalSpent: { $sum: "$amount" } } }
  ]);

  const summaryLines = aggregation.map(a => 
    `- ${a._id.type.toUpperCase()} | ${a._id.category || 'Uncategorized'}: ₹${a.totalSpent}`
  );

  return summaryLines.length > 0 
    ? `\nCURRENT MONTH AGGREGATES (Use this for math questions!):\n${summaryLines.join('\n')}\n`
    : `\nNo transactions found for the current month summary.\n`;
};


const getLLM = (streaming = false) => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  
  if (provider === 'openai') {
    return new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.LLM_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      streaming
    });
  }

  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    modelName: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.2,
    streaming
  });
};

const INSIGHT_PROMPT = PromptTemplate.fromTemplate(`
You are an expert personal finance advisor. 

═══ RULES ═══
1. Use the "CURRENT MONTH AGGREGATES" to answer questions about total spending or math.
2. Use "SPECIFIC TRANSACTIONS" to give detailed answers about single purchases.
3. Be specific — mention actual amounts (₹).
4. Provide actionable advice to help them save money.
5. If the context does not contain enough data, state what is missing.

═══ DATA ═══
{mathSummary}

SPECIFIC TRANSACTIONS (Top Relevance):
{context}

═══ USER'S QUESTION ═══
{question}

═══ YOUR INSIGHT ═══
`);

// ─────────────────────────────────────────────────────────────
//  Streaming Output Generator
// ─────────────────────────────────────────────────────────────
const askAIStream = async (userId, query, res) => {
  const contextDocs = await retrieveContext(userId, query);
  const mathSummary = await getMathSummary(userId);
  const context = contextDocs.map((d) => d.pageContent).join('\n');

  const chain = RunnableSequence.from([
    { question: (i) => i.question, context: (i) => i.context, mathSummary: (i) => i.mathSummary },
    INSIGHT_PROMPT,
    getLLM(true),
    new StringOutputParser(),
  ]);

  // Initiate Server Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const stream = await chain.stream({ question: query, context, mathSummary });
    
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`);
    res.end();
  }
};

const generateInsights = async (userId, transactions) => {
  const mathSummary = await getMathSummary(userId);
  let context = transactionsToTexts(transactions).join('\n');

  const PROACTIVE_PROMPT = PromptTemplate.fromTemplate(`
You are an expert personal finance advisor. Generate 3-5 actionable insights.
FORMAT: 📌 **[Topic]** — [Insight with ₹ numbers] → [Actionable recommendation]

{mathSummary}
TRANSACTIONS:
{context}

YOUR INSIGHTS:
`);

  const chain = RunnableSequence.from([
    { context: (i) => i.context, mathSummary: (i) => i.mathSummary },
    PROACTIVE_PROMPT,
    getLLM(false),
    new StringOutputParser(),
  ]);

  const insights = await chain.invoke({ context, mathSummary });
  return { insights, sources: transactions.length };
};

module.exports = {
  indexTransactions,
  clearIndex,
  askAIStream,
  generateInsights,
  indexTransaction: async (tx) => indexTransactions(tx.user, [tx])
};
