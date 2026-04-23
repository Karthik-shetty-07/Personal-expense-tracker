import { create } from 'zustand';

const useStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  transactions: [],
  insights: [],
  isLoading: false,
  
  // Auth actions
  login: (userData, token) => {
    localStorage.setItem('token', token);
    set({ user: userData, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, transactions: [], insights: [] });
  },
  
  // User state
  setUser: (user) => set({ user }),
  
  // Transaction actions
  setTransactions: (transactions) => set({ transactions }),
  addTransaction: (transaction) => set((state) => ({ 
    transactions: [transaction, ...state.transactions] 
  })),
  removeTransaction: (id) => set((state) => ({ 
    transactions: state.transactions.filter(t => t._id !== id) 
  })),

  // Insight actions
  setInsights: (insights) => set({ insights }),
  addInsight: (insight) => set((state) => ({
    insights: [...state.insights, { ...insight, id: insight.id || Date.now().toString() }]
  })),
  
  // Socket events handler
  receiveSocketTransaction: (transaction) => set((state) => {
    // Prevent duplicates
    const exists = state.transactions.some(t => t._id === transaction._id);
    if (!exists) {
      return { transactions: [transaction, ...state.transactions] };
    }
    return state;
  }),
  removeSocketTransaction: (id) => set((state) => ({
    transactions: state.transactions.filter(t => t._id !== id)
  })),
}));

export default useStore;
