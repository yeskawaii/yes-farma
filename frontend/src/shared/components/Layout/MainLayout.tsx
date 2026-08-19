import { Outlet } from 'react-router-dom';
import { BottomNav } from '../BottomNav/BottomNav';
import { Sidebar } from '../Sidebar/Sidebar';
import { Bell, Search, LogOut, HeartPulse } from 'lucide-react';
import { useAuth } from '../../../core/auth/AuthProvider';

export function MainLayout() {
  const { user, activeRole, logout } = useAuth();

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'YF';
  const roleDisplay = activeRole === 'OWNER' ? 'Propietario' : activeRole === 'PROFESSIONAL' ? 'Profesional' : activeRole === 'ASSISTANT' ? 'Asistente' : 'Personal';

  return (
    <div className="flex min-h-screen bg-[#F5F8FC] animate-slide-up">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full min-h-screen">

        {/* Header Mobile (Hidden on Desktop) */}
        <header className="md:hidden h-16 px-4 flex items-center justify-between sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shadow-sm border border-blue-100">
              <HeartPulse size={18} />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">Yeskira Salud</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="text-slate-500 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-50 transition-colors">
              <Bell size={20} />
            </button>
            <button onClick={logout} className="text-slate-500 hover:text-red-500 w-9 h-9 rounded-full flex items-center justify-center transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Header Desktop (Hidden on Mobile) */}
        <header className="hidden md:flex h-16 px-6 items-center justify-between sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar pacientes, citas..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-slate-500 p-2 rounded-full hover:bg-slate-50 transition-colors">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900 leading-none">{user ? `${user.firstName} ${user.lastName}` : 'Cargando...'}</p>
                <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-wide font-medium">{roleDisplay}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shadow-sm">
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 w-full max-w-6xl mx-auto">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <BottomNav />
      </div>
    </div>
  );
}
