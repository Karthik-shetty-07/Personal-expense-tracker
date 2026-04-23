import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Search, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import api from '../services/api';

export default function TransactionList() {
  const transactions = useStore((state) => state.transactions);
  const removeTransaction = useStore((state) => state.removeTransaction);
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      removeTransaction(id);
    } catch (err) {
      console.error('Failed to delete transaction', err);
    }
  };

  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-fin-surface rounded-2xl border border-gray-800 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg font-semibold text-white">Recent Transactions</h2>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-fin-accent transition-colors focus:ring-1 focus:ring-fin-accent"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No transactions found.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-fin-surface border-b border-gray-800 text-xs uppercase text-gray-500">
              <tr>
                <th className="font-medium px-6 py-4">Transaction</th>
                <th className="font-medium px-6 py-4">Category</th>
                <th className="font-medium px-6 py-4">Date</th>
                <th className="font-medium px-6 py-4 text-right">Amount</th>
                <th className="font-medium px-6 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((t) => {
                const isIncome = t.type === 'income';
                return (
                  <tr key={t._id} className="hover:bg-gray-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isIncome ? 'bg-fin-accent/10 text-fin-accent' : 'bg-white/10 text-white'}`}>
                          {isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <span className="font-medium text-gray-200">{t.description}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {format(new Date(t.date), 'MMM dd, yyyy')}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${isIncome ? 'text-fin-accent' : 'text-white'}`}>
                      {isIncome ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDelete(t._id)} className="text-gray-500 hover:text-fin-danger">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
