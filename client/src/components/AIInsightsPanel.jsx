import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, MessageSquareText, Send } from 'lucide-react';
import api from '../services/api';
import useStore from '../store/useStore';

export default function AIInsightsPanel() {
  const insights = useStore((state) => state.insights);
  const setInsights = useStore((state) => state.setInsights);
  const addInsight = useStore((state) => state.addInsight);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [insights]);

  const fetchProactiveInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/ai/insights');
      addInsight({ text: res.data.data.insights, type: 'ai' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isStreaming) return;

    const query = chatInput;
    setChatInput('');
    addInsight({ text: query, type: 'user' });
    
    // Create placeholder for streaming response
    const placeholderId = Date.now().toString();
    addInsight({ id: placeholderId, text: '', type: 'ai', isStreaming: true });
    
    setIsStreaming(true);
    setError(null);

    try {
      const token = useStore.getState().token;
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                currentText += data.text;
                setInsights(useStore.getState().insights.map(i => 
                  i.id === placeholderId ? { ...i, text: currentText } : i
                ));
              }
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
      
      // Remove streaming flag
      setInsights(useStore.getState().insights.map(i => 
        i.id === placeholderId ? { ...i, isStreaming: false } : i
      ));
      
    } catch (err) {
      setError('Failed to get answer.');
      // Remove the streaming placeholder if it failed
      setInsights(useStore.getState().insights.filter(i => i.id !== placeholderId));
    } finally {
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    // Initial fetch if empty
    if (insights.length === 0) {
      fetchProactiveInsights();
    }
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
          onClick={fetchProactiveInsights}
          disabled={loading || isStreaming}
          className="text-xs font-medium bg-fin-accent/10 hover:bg-fin-accent/20 text-fin-accent px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {loading ? 'Analyzing...' : 'Generate Proactive Insight'}
        </button>
      </div>

      <div className="flex-1 overflow-auto z-10 custom-scrollbar pr-2 mb-4 space-y-4">
        {insights.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center px-4">
            <MessageSquareText className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">Ask a question about your spending or click generate to get proactive insights.</p>
          </div>
        ) : (
          insights.map((insight, idx) => (
            <div key={insight.id || idx} className={`flex ${insight.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                insight.type === 'user' 
                  ? 'bg-fin-accent text-white' 
                  : 'bg-gray-800/50 text-gray-200 border border-gray-700 whitespace-pre-wrap leading-relaxed'
              }`}>
                {insight.text}
                {insight.isStreaming && <span className="ml-1 inline-block w-1.5 h-4 bg-fin-accent animate-pulse align-middle"></span>}
              </div>
            </div>
          ))
        )}
        
        {loading && insights.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-fin-accent gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm font-medium">Analyzing your spending patterns...</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleAskQuestion} className="relative z-10">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask about your spending..."
          className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm text-gray-200 focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
          disabled={isStreaming || loading}
        />
        <button 
          type="submit"
          disabled={isStreaming || loading || !chatInput.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-fin-accent disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
