import { Users, Calendar, Plus, ChevronRight, Activity, Clock } from 'lucide-react';

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col gap-2 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Hello, Dr. Yescas</h1>
        <p className="text-[var(--text-muted)] text-lg md:text-xl">You have 5 appointments today.</p>
      </div>

      {/* Quick Actions & Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up delay-100">
        
        {/* Mobile Quick Actions (Scrollable horizontally on mobile, Grid on desktop) */}
        <div className="col-span-1 md:col-span-2 flex gap-4 overflow-x-auto pb-4 md:pb-0 md:grid md:grid-cols-3 scrollbar-hide">
          <button className="flex-none md:flex-auto flex flex-col md:flex-row items-center md:justify-center gap-3 w-24 md:w-auto p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] transition-all hover:shadow-md group active:scale-95">
            <div className="w-14 h-14 md:w-10 md:h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center transition-transform group-hover:scale-110">
              <Plus className="text-teal-600 dark:text-teal-400" size={24} />
            </div>
            <span className="text-sm font-bold md:text-base">New Appt</span>
          </button>
          
          <button className="flex-none md:flex-auto flex flex-col md:flex-row items-center md:justify-center gap-3 w-24 md:w-auto p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] hover:border-blue-500 transition-all hover:shadow-md group active:scale-95">
            <div className="w-14 h-14 md:w-10 md:h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center transition-transform group-hover:scale-110">
              <Users className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <span className="text-sm font-bold md:text-base">Patients</span>
          </button>

          <button className="flex-none md:flex-auto flex flex-col md:flex-row items-center md:justify-center gap-3 w-24 md:w-auto p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] hover:border-purple-500 transition-all hover:shadow-md group active:scale-95">
            <div className="w-14 h-14 md:w-10 md:h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center transition-transform group-hover:scale-110">
              <Activity className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
            <span className="text-sm font-bold md:text-base">Records</span>
          </button>
        </div>

        {/* Desktop Weekly Overview (Hidden on Mobile, shown later in feed on mobile) */}
        <div className="hidden md:flex flex-col justify-between bg-[var(--text-main)] text-[var(--background)] rounded-2xl p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Weekly Overview</h3>
            <Calendar size={20} className="opacity-70" />
          </div>
          <div className="flex items-center justify-around">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold">24</span>
              <span className="text-xs font-semibold uppercase tracking-wider opacity-70 mt-1">Patients</span>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-[var(--primary)]">12</span>
              <span className="text-xs font-semibold uppercase tracking-wider opacity-70 mt-1">Hours</span>
            </div>
          </div>
        </div>

      </div>

      {/* Main Feed Content (Split to 2 columns on Desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 animate-slide-up delay-200">
        
        {/* Left Column (Appointments) */}
        <div className="col-span-1 md:col-span-2 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl md:text-2xl font-bold">Upcoming Today</h2>
            <button className="text-[var(--primary)] font-bold text-sm hover:underline">See all</button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors cursor-pointer active:scale-[0.98] shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center justify-center min-w-[60px] p-2 bg-[var(--background)] rounded-xl">
                <span className="text-lg font-extrabold text-[var(--text-main)] leading-none">10:00</span>
                <span className="text-xs font-bold text-[var(--text-muted)] mt-1">AM</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[var(--text-main)] text-lg">Maria Garcia</h3>
                <p className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                  <Clock size={14} /> General Checkup
                </p>
              </div>
              <ChevronRight className="text-[var(--text-muted)]" size={24} />
            </div>

            <div className="flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors cursor-pointer active:scale-[0.98] shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center justify-center min-w-[60px] p-2 bg-[var(--background)] rounded-xl">
                <span className="text-lg font-extrabold text-[var(--text-main)] leading-none">11:30</span>
                <span className="text-xs font-bold text-[var(--text-muted)] mt-1">AM</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[var(--text-main)] text-lg">Carlos Ruiz</h3>
                <p className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                  <Clock size={14} /> Blood test results
                </p>
              </div>
              <ChevronRight className="text-[var(--text-muted)]" size={24} />
            </div>
          </div>
        </div>

        {/* Right Column (Mobile Overview / Desktop Sidebar Info) */}
        <div className="col-span-1 flex flex-col gap-4 animate-slide-up delay-300">
          
          {/* Show this card only on mobile (since it's at the top on Desktop) */}
          <div className="md:hidden flex flex-col justify-between bg-[var(--surface)] rounded-2xl p-6 border border-[var(--border)] shadow-sm">
            <div className="flex justify-between items-center mb-4 text-[var(--text-main)]">
              <h3 className="font-bold text-lg">Weekly Overview</h3>
              <Calendar size={20} className="text-[var(--text-muted)]" />
            </div>
            <div className="flex items-center justify-around mt-2">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-[var(--text-main)]">24</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-1">Patients</span>
              </div>
              <div className="w-px h-10 bg-[var(--border)]"></div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-[var(--primary)]">12</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-1">Hours</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-col gap-4">
            <h2 className="text-xl font-bold">Recent Updates</h2>
            <div className="bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)] text-sm text-[var(--text-muted)] flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                <p><span className="font-bold text-[var(--text-main)]">Lab Results</span> for Carlos Ruiz are now available in his record.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-[var(--primary)] mt-1.5 flex-shrink-0"></div>
                <p><span className="font-bold text-[var(--text-main)]">Dr. Silva</span> covered your 4:00 PM shift on Tuesday.</p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
