import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Wallet, User, CircleHelp } from 'lucide-react';
import useStore from '../store/useStore';
import { disconnectSocket } from '../services/socket';

export default function Layout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    disconnectSocket();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' }
  ];

  return (
    <div className="flex h-screen bg-fin-bg text-fin-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 bg-fin-surface flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-800 font-bold text-xl text-fin-accent tracking-wider">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-fin-accent to-emerald-400 mr-3 shadow-lg shadow-emerald-500/20"></div>
          AI TRACKER
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                  ? 'bg-fin-accent/10 text-fin-accent' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-gray-400">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden lg:block w-32 truncate">
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-fin-danger transition-colors" title="Log out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="h-16 border-b border-gray-800 bg-fin-surface flex items-center justify-between px-4 md:hidden">
          <div className="font-bold border border-fin-accent/50 text-fin-accent px-2 py-1 rounded text-sm">
            AI TRACKER
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-white">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
