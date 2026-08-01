import { Outlet } from 'react-router-dom';
import { BottomNav } from '../BottomNav/BottomNav';
import { Sidebar } from '../Sidebar/Sidebar';
import { Bell, Search, LogOut } from 'lucide-react';
import { useAuth } from '../../../core/auth/AuthProvider';

export function MainLayout() {
  const { user, activeRole, logout } = useAuth();

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'YF';

  return (
    <div className="flex min-h-screen bg-[var(--background)] animate-slide-up">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full max-w-full md:max-w-5xl mx-auto shadow-none md:shadow-[var(--shadow-float)] bg-[var(--background)]">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="md:hidden h-16 px-5 flex items-center justify-between sticky top-0 z-40 glass">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--text-main)] text-[var(--background)] rounded-md flex items-center justify-center font-bold text-sm">
              YF
            </div>
            <span className="font-bold text-lg tracking-tight">Yes Farma</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-[var(--text-muted)] w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 hover:text-[var(--text-main)] transition-colors">
              <Bell size={20} />
            </button>
            <button onClick={logout} className="text-red-500 w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Desktop Header (Hidden on Mobile) */}
        <header className="hidden md:flex h-20 px-8 items-center justify-between sticky top-0 z-40 glass border-b border-[var(--border)]">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input
              type="text"
              placeholder="Search patients, appointments..."
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--text-main)] transition-shadow"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-[var(--text-muted)] p-2 rounded-full hover:bg-black/5 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-[var(--border)]">
              <div className="text-right">
                <p className="text-sm font-semibold text-[var(--text-main)] leading-none">{user ? `Dr. ${user.lastName}` : 'Cargando...'}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{activeRole || 'Cargando...'}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold">
                {initials}
              </div>
              <button onClick={logout} className="ml-2 text-red-500 hover:text-red-600 transition-colors" title="Cerrar sesión">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 md:p-8 pb-28 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <BottomNav />
      </div>
    </div>
  );
}
