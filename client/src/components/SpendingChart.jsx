import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import useStore from '../store/useStore';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

export default function SpendingChart() {
  const transactions = useStore((state) => state.transactions);

  const data = useMemo(() => {
    // Get last 6 months
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return {
        date: d,
        name: format(d, 'MMM'),
        expense: 0,
        income: 0,
        start: startOfMonth(d),
        end: endOfMonth(d)
      };
    });

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const monthData = months.find(m => isWithinInterval(tDate, { start: m.start, end: m.end }));
      
      if (monthData) {
        if (t.type === 'expense') monthData.expense += t.amount;
        if (t.type === 'income') monthData.income += t.amount;
      }
    });

    return months;
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <div className="bg-fin-surface rounded-2xl border border-gray-800 p-6 flex flex-col h-full min-h-[300px] items-center justify-center">
        <p className="text-gray-500">No data available for chart.</p>
      </div>
    );
  }

  return (
    <div className="bg-fin-surface rounded-2xl border border-gray-800 p-6 flex flex-col h-full min-h-[300px]">
      <h2 className="text-lg font-semibold text-white mb-4">6-Month Trend</h2>
      <div className="flex-1 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
            <Tooltip 
              cursor={{ fill: '#1f2937' }}
              contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', color: '#f9fafb' }}
              formatter={(value) => `₹${Number(value).toFixed(2)}`}
            />
            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
