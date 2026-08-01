import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, User } from 'lucide-react';

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 w-full h-[72px] flex justify-around items-center px-2 pb-[env(safe-area-inset-bottom)] z-50 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:hidden animate-slide-up delay-300">
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
      >
        <LayoutDashboard size={22} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[10px] font-medium">Resumen</span>
      </NavLink>

      <NavLink
        to="/patients"
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
      >
        <Users size={22} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[10px] font-medium">Pacientes</span>
      </NavLink>

      <NavLink
        to="/appointments"
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
      >
        <Calendar size={22} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[10px] font-medium">Agenda</span>
      </NavLink>

      <NavLink
        to="/settings"
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
      >
        <User size={22} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[10px] font-medium">Perfil</span>
      </NavLink>
    </nav>
  );
}
