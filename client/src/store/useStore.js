import { create } from 'zustand';

const safeStorage = {
  getItem(key) {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures silently.
    }
  },
  removeItem(key) {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures silently.
    }
  }
};

const useStore = create((set) => ({
  user: null,
  token: safeStorage.getItem('token') || null,
  transactions: [],
  insights: [],
  isLoading: false,
  
  // Auth actions
  login: (userData, token) => {
    if (token) safeStorage.setItem('token', token);
    set({ user: userData, token });
  },
  logout: () => {
    safeStorage.removeItem('token');
    set({ user: null, token: null, transactions: [], insights: [] });
  },
  
  // User state
  setUser: (user) => set({ user }),
  
  // Transaction actions
  setTransactions: (transactions) => set({ transactions }),
  addTransaction: (transaction) => set((state) => {
    const existingId = transaction?._id || transaction?.id;
    const exists = state.transactions.some((t) => (t._id || t.id) === existingId);
    if (exists) {
      return state;
    }
    return { transactions: [transaction, ...state.transactions] };
  }),
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
    const id = transaction?._id || transaction?.id;
    const exists = state.transactions.some((t) => (t._id || t.id) === id);
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
