import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import useStore from '../store/useStore';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4', '#6366f1'];

export default function CategoryChart() {
  const transactions = useStore((state) => state.transactions);

  const data = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const categoryTotals = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {});

    return Object.keys(categoryTotals).map((key) => ({
      name: key,
      value: categoryTotals[key]
    })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  if (transactions.filter(t => t.type === 'expense').length === 0) {
    return (
      <div className="bg-fin-surface rounded-2xl border border-gray-800 p-6 flex items-center justify-center h-full">
        <p className="text-gray-500">No expense data for chart.</p>
      </div>
    );
  }

  return (
    <div className="bg-fin-surface rounded-2xl border border-gray-800 p-6 flex flex-col h-full">
      <h2 className="text-lg font-semibold text-white mb-4">Expense Breakdown</h2>
      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value) => `$${Number(value).toFixed(2)}`}
              contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
