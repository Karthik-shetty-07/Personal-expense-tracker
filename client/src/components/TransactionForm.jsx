import { useState } from 'react';
import { Plus } from 'lucide-react';
import useStore from '../store/useStore';
import api from '../services/api';

export default function TransactionForm() {
  const addTransaction = useStore((state) => state.addTransaction);
  
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense',
    description: '',
    category: 'Food & Drink',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const categories = [
    'Food & Drink',
    'Transportation',
    'Shopping',
    'Entertainment',
    'Housing',
    'Utilities',
    'Health',
    'Education',
    'Income',
    'Other'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!formData.amount || !formData.description) return;

    setLoading(true);
    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
        date: new Date().toISOString()
      };
      const res = await api.post('/transactions', payload);
      // addTransaction(res.data.data); // Socket might duplicate this, but we deduplicate in store
      addTransaction(res.data.data);
      setFormData({ amount: '', type: 'expense', description: '', category: 'Food & Drink' });
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-fin-surface rounded-2xl border border-gray-800 p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-fin-accent/5 rounded-bl-full pointer-events-none"></div>
      
      <h2 className="text-lg font-semibold text-white mb-6">Quick Add</h2>
      
      {error && <div className="p-3 mb-4 rounded bg-fin-danger/10 text-fin-danger text-sm border border-fin-danger/20">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, type: 'expense' })}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${formData.type === 'expense' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, type: 'income' })}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${formData.type === 'income' ? 'bg-fin-accent/20 text-fin-accent shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Income
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
            <input
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
          <input
            type="text"
            required
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
            placeholder="E.g. Groceries"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors appearance-none"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-fin-accent hover:bg-fin-accent-hover text-white font-semibold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-70 mt-2"
        >
          <Plus className="w-5 h-5" />
          {loading ? 'Saving...' : 'Add Transaction'}
        </button>
      </form>
    </div>
  );
}
