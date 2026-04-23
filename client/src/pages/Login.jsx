import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Wallet, ArrowRight, Loader2 } from 'lucide-react';
import useStore from '../store/useStore';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const login = useStore((state) => state.login);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', formData);
      const { token, ...userData } = res.data.data;
      login(userData, token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-fin-bg flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative z-10 w-full max-w-lg mx-auto lg:mx-0">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-fin-accent to-emerald-400 mb-6 flex items-center justify-center shadow-lg shadow-emerald-500/20">
               <Wallet className="text-white w-6 h-6" />
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Sign in to Tracker</h2>
            <p className="mt-2 text-sm text-gray-400">
               Welcome back. Enter your details below.
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 rounded-lg bg-fin-danger/10 text-fin-danger text-sm border border-fin-danger/20">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-300">Email address</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1 w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-fin-accent hover:bg-fin-accent-hover text-white font-semibold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-fin-accent hover:text-emerald-400 transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
      
      {/* Right side - Abstract Graphic */}
      <div className="hidden lg:flex flex-1 relative bg-fin-surface overflow-hidden border-l border-gray-800">
        <div className="absolute inset-0 z-0">
           <div className="absolute top-1/4 -left-1/4 w-[800px] h-[800px] bg-fin-accent/20 rounded-full blur-[120px]"></div>
           <div className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px]"></div>
           {/* Glassmorphism card overlay */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-96 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl skew-x-[-5deg] rotate-[5deg]">
              <div className="p-8 h-full flex flex-col justify-between">
                <div className="space-y-3">
                   <div className="h-2 w-12 bg-fin-accent/40 rounded"></div>
                   <div className="h-2 w-24 bg-white/20 rounded"></div>
                </div>
                <div className="mt-auto flex gap-4 items-end">
                   <div className="h-32 flex-1 bg-fin-accent/60 rounded-t-lg"></div>
                   <div className="h-44 flex-1 bg-fin-accent/80 rounded-t-lg"></div>
                   <div className="h-20 flex-1 bg-white/20 rounded-t-lg"></div>
                </div>
              </div>
           </div>
        </div>
        <div className="relative z-10 flex flex-col justify-end p-24 pb-32">
          <h3 className="text-4xl font-bold text-white mb-4">Track everything.<br/>Gain insights.</h3>
          <p className="text-xl text-gray-400 max-w-md">The modern way to manage your expenses, powered by artificial intelligence.</p>
        </div>
      </div>
    </div>
  );
}
