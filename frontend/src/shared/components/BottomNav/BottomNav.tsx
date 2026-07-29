import { NavLink } from 'react-router-dom';
import { Home, Users, Calendar, User } from 'lucide-react';

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 w-full h-20 flex justify-around items-center px-4 pb-[env(safe-area-inset-bottom)] z-50 glass border-t border-[var(--border)] md:hidden animate-slide-up delay-300">
      <NavLink 
        to="/dashboard" 
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
      >
        <Home size={24} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[0.7rem] font-medium">Home</span>
      </NavLink>
      
      <NavLink 
        to="/patients" 
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
      >
        <Users size={24} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[0.7rem] font-medium">Patients</span>
      </NavLink>

      <NavLink 
        to="/appointments" 
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
      >
        <Calendar size={24} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[0.7rem] font-medium">Schedule</span>
      </NavLink>

      <NavLink 
        to="/profile" 
        className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
      >
        <User size={24} className="transition-transform duration-200 group-[.active]:-translate-y-0.5" />
        <span className="text-[0.7rem] font-medium">Profile</span>
      </NavLink>
    </nav>
  );
}
