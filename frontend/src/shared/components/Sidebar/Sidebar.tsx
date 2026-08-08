import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Settings, LogOut, FileText, HeartPulse } from 'lucide-react';
import { useAuth } from '../../../core/auth/AuthProvider';

export function Sidebar() {
  const { logout, activeRole } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen border-r border-slate-200 bg-white sticky top-0 left-0 p-4 animate-slide-up z-50">
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
          <HeartPulse size={20} />
        </div>
        <div>
          <h1 className="font-bold text-lg text-slate-900 leading-tight tracking-tight">Yes Farma</h1>
          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">Portal Clínico</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <LayoutDashboard size={18} />
          <span>Resumen del día</span>
        </NavLink>

        <NavLink
          to="/patients"
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <Users size={18} />
          <span>Pacientes</span>
        </NavLink>

        <NavLink
          to="/appointments"
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <Calendar size={18} />
          <span>Agenda</span>
        </NavLink>

        {(activeRole === 'OWNER' || activeRole === 'PROFESSIONAL') && (
          <NavLink
            to="/records"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <FileText size={18} />
            <span>Expedientes</span>
          </NavLink>
        )}
      </nav>

      <div className="flex flex-col gap-1 mt-auto pt-4 border-t border-slate-200">
        <NavLink
          to="/settings"
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <Settings size={18} />
          <span>Configuración</span>
        </NavLink>
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-50 font-medium transition-colors duration-200 text-left w-full text-sm">
          <LogOut size={18} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
