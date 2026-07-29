import { NavLink } from 'react-router-dom';
import { Home, Users, Calendar, Settings, LogOut, FileText } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 h-screen border-r border-[var(--border)] bg-[var(--surface)] sticky top-0 left-0 p-4 animate-slide-up">
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[var(--text-main)] text-[var(--background)] flex items-center justify-center font-bold text-xl shadow-md">
          YF
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight">Yes Farma</h1>
          <p className="text-xs text-[var(--text-muted)] font-medium">Clinic Portal</p>
        </div>
      </div>

      <nav className="flex flex-col gap-2 flex-1">
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 font-medium ${isActive ? 'bg-[var(--text-main)] text-[var(--background)] shadow-md' : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] hover:text-[var(--text-main)]'}`}
        >
          <Home size={20} />
          <span>Dashboard</span>
        </NavLink>
        
        <NavLink 
          to="/patients" 
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 font-medium ${isActive ? 'bg-[var(--text-main)] text-[var(--background)] shadow-md' : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] hover:text-[var(--text-main)]'}`}
        >
          <Users size={20} />
          <span>Patients</span>
        </NavLink>

        <NavLink 
          to="/appointments" 
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 font-medium ${isActive ? 'bg-[var(--text-main)] text-[var(--background)] shadow-md' : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] hover:text-[var(--text-main)]'}`}
        >
          <Calendar size={20} />
          <span>Schedule</span>
        </NavLink>

        <NavLink 
          to="/records" 
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 font-medium ${isActive ? 'bg-[var(--text-main)] text-[var(--background)] shadow-md' : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] hover:text-[var(--text-main)]'}`}
        >
          <FileText size={20} />
          <span>EHR Records</span>
        </NavLink>
      </nav>

      <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[var(--border)]">
        <NavLink 
          to="/settings" 
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 font-medium ${isActive ? 'bg-[var(--text-main)] text-[var(--background)] shadow-md' : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] hover:text-[var(--text-main)]'}`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-50 font-medium transition-colors duration-200 text-left">
          <LogOut size={20} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
