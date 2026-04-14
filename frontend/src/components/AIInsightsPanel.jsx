import { useState, useEffect } from 'react';
import { Sparkles, Loader2, MessageSquareText } from 'lucide-react';
import api from '../services/api';

export default function AIInsightsPanel() {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/ai/insights');
      // The backend returns markdown or plain text in res.data.data.insights
      setInsights(res.data.data.insights);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch optionally
    // fetchInsights();
  }, []);

  return (
    <div className="bg-gradient-to-br from-fin-surface to-[#0f172a] rounded-2xl border border-fin-accent/20 p-6 relative overflow-hidden h-full flex flex-col">
      <div className="absolute top-0 right-0 w-64 h-64 bg-fin-accent/10 rounded-bl-full blur-3xl pointer-events-none"></div>
      
      <div className="flex items-center justify-between mb-4 z-10">
        <div className="flex items-center gap-2 text-fin-accent">
          <Sparkles className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-white">AI Assistant</h2>
        </div>
        <button 
          onClick={fetchInsights}
          disabled={loading}
          className="text-xs font-medium bg-fin-accent/10 hover:bg-fin-accent/20 text-fin-accent px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {loading ? 'Analyzing...' : 'Generate New Insight'}
        </button>
      </div>

      <div className="flex-1 overflow-auto z-10 custom-scrollbar pr-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-fin-accent gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm font-medium">Analyzing your spending patterns...</p>
          </div>
        ) : error ? (
          <div className="text-fin-danger text-sm p-4 bg-fin-danger/10 rounded-lg border border-fin-danger/20">
            {error}
          </div>
        ) : insights ? (
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {insights}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center px-4">
            <MessageSquareText className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">Click "Generate New Insight" to get AI-powered financial advice based on your recent activity.</p>
          </div>
        )}
      </div>
    </div>
  );
}
