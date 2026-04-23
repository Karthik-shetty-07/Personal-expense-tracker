// ─────────────────────────────────────────────────────────────
//  ai.service.js — Groq LLM integration (llama3-70b-8192)
// ─────────────────────────────────────────────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const generateInsightsFromContext = async (context, userQuery = null) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your_groq_api_key') {
    return {
      insights: '⚠️ GROQ_API_KEY is not configured. Please add a valid Groq API key to your .env file.',
      model: null,
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
        model: 'llama3-70b-8192',
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

module.exports = { generateInsightsFromContext };
