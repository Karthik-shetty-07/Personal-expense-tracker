import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Wallet, ArrowRight, Loader2 } from 'lucide-react';
import useStore from '../store/useStore';
import api from '../services/api';

export default function Register() {
  const navigate = useNavigate();
  const login = useStore((state) => state.login);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/register', formData);
      const { token, ...userData } = res.data.data;
      login(userData, token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-fin-bg flex flex-row-reverse">
      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative z-10 w-full max-w-lg mx-auto lg:mx-0">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-bl from-fin-accent to-blue-500 mb-6 flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Wallet className="text-white w-6 h-6" />
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Create an account</h2>
            <p className="mt-2 text-sm text-gray-400">
               Start managing your expenses like a pro.
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
                <label className="text-sm font-medium text-gray-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-fin-accent focus:ring-1 focus:ring-fin-accent transition-colors"
                  placeholder="John Doe"
                />
              </div>
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
                  Sign Up
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-fin-accent hover:text-emerald-400 transition-colors">
              Log in
            </Link>
          </p>
        </div>
      </div>
      
      {/* Left side - Abstract Graphic */}
      <div className="hidden lg:flex flex-1 relative bg-[#0f172a] overflow-hidden border-r border-gray-800">
        <div className="absolute inset-0 z-0">
           <div className="absolute bottom-1/4 -left-1/4 w-[800px] h-[800px] bg-fin-accent/20 rounded-full blur-[120px]"></div>
           {/* Geometric shapes */}
           <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 border-[40px] border-fin-accent/10 rounded-full"></div>
           <div className="absolute top-1/2 left-1/2 w-32 h-32 border border-white/20 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        </div>
        <div className="relative z-10 flex flex-col justify-end p-24 pb-32">
          <h3 className="text-4xl font-bold text-white mb-4">Complete control.<br/>Simple setup.</h3>
          <p className="text-xl text-gray-400 max-w-md">Access your dashboard seamlessly and manage finances smartly.</p>
        </div>
      </div>
    </div>
  );
}
