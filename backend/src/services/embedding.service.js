// ─────────────────────────────────────────────────────────────
//  embedding.service.js — Transaction text + vector embedding
// ─────────────────────────────────────────────────────────────
const { OpenAIEmbeddings } = require('@langchain/openai');

let embeddingsInstance = null;

/**
 * Lazy-initialise the embeddings model.
 * Uses OpenAI's text-embedding-3-small by default (cheap + fast).
 */
const getEmbeddingsModel = () => {
  if (!embeddingsInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for embeddings generation');
    }
    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    });
  }
  return embeddingsInstance;
};

// ─────────────────────────────────────────────────────────────
//  Convert a single transaction into natural-language text
// ─────────────────────────────────────────────────────────────
const transactionToText = (tx) => {
  const date = tx.date
    ? new Date(tx.date).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'unknown date';

  const amount = typeof tx.amount === 'number'
    ? `₹${tx.amount.toLocaleString('en-IN')}`
    : tx.amount;

  return [
    `${tx.type === 'income' ? 'Received' : 'Spent'} ${amount}`,
    `on ${date}`,
    `Category: ${tx.category || 'Uncategorized'}`,
    `Description: ${tx.description || 'N/A'}`,
  ].join(' | ');
};

// ─────────────────────────────────────────────────────────────
//  Batch-convert an array of transactions
// ─────────────────────────────────────────────────────────────
const transactionsToTexts = (transactions) =>
  transactions.map(transactionToText);

// ─────────────────────────────────────────────────────────────
//  Generate embeddings for an array of text strings
// ─────────────────────────────────────────────────────────────
const generateEmbeddings = async (texts) => {
  const model = getEmbeddingsModel();
  return model.embedDocuments(texts);
};

/**
 * Generate a single embedding for a query string.
 */
const generateQueryEmbedding = async (query) => {
  const model = getEmbeddingsModel();
  return model.embedQuery(query);
};

module.exports = {
  getEmbeddingsModel,
  transactionToText,
  transactionsToTexts,
  generateEmbeddings,
  generateQueryEmbedding,
};
