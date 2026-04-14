import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import useStore from '../store/useStore';
import api from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';

import StatCard from '../components/StatCard';
import TransactionForm from '../components/TransactionForm';
import TransactionList from '../components/TransactionList';
import CategoryChart from '../components/CategoryChart';
import AIInsightsPanel from '../components/AIInsightsPanel';

export default function Dashboard() {
  const transactions = useStore((state) => state.transactions);
  const setTransactions = useStore((state) => state.setTransactions);
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.get('/transactions');
        setTransactions(res.data.data);
      } catch (err) {
        console.error('Failed to fetch transactions', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    initSocket();
    
    return () => disconnectSocket();
  }, [setTransactions]);

  // Derived stats
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
      if (t.type === 'income') income += Number(t.amount);
      if (t.type === 'expense') expense += Number(t.amount);
    });
    const balance = income - expense;
    return { balance, income, expense };
  }, [transactions]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <RefreshCw className="w-8 h-8 text-fin-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
        <p className="text-gray-400 mt-1 text-sm">Welcome back to your financial hub.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total Balance" 
          amount={stats.balance} 
          icon={Wallet} 
          className="md:col-span-1"
        />
        <StatCard 
          title="Total Income" 
          amount={stats.income} 
          icon={TrendingUp} 
          trend="up"
          trendValue="12.5"
        />
        <StatCard 
          title="Total Expense" 
          amount={stats.expense} 
          icon={TrendingDown} 
          trend="down"
          trendValue="4.2"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="xl:col-span-2 space-y-6 flex flex-col min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
             {/* Chart takes up half of the row on non-mobile */}
             <CategoryChart />
             {/* AI Panel takes up the other half */}
             <AIInsightsPanel />
          </div>
          {/* Transaction List takes rest of space */}
          <div className="h-[500px] xl:h-auto xl:flex-1">
             <TransactionList />
          </div>
        </div>

        {/* Right Column - Forms */}
        <div className="xl:col-span-1 space-y-6">
          <TransactionForm />
        </div>
      </div>
    </div>
  );
}
