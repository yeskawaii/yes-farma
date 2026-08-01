import { Users, Calendar, Plus, ChevronRight, FileText, Clock, Building2 } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';

export function DashboardPage() {
  const { user, memberships } = useAuth();

  const clinicName = memberships && memberships.length > 0 ? memberships[0].clinicName : 'Clínica';

  return (
    <div className="flex flex-col gap-6 md:gap-8">

      {/* Header */}
      <div className="flex flex-col gap-1.5 animate-slide-up">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bienvenido, Dr. {user?.lastName || ''}</h1>
        <div className="flex items-center gap-2 text-slate-500 text-lg">
          <Building2 size={18} />
          <p>{clinicName}</p>
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            Datos de ejemplo
          </span>
        </div>
      </div>

      {/* Quick Actions Overview (Compact Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-100">

        {/* Card: Nueva Cita */}
        <button className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
            <Plus size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Nueva cita</h3>
            <p className="text-sm text-slate-500 mt-0.5">Agenda una consulta</p>
          </div>
          <ChevronRight className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20} />
        </button>

        {/* Card: Pacientes */}
        <button className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24">
          <div className="w-12 h-12 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
            <Users size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Pacientes</h3>
            <p className="text-sm text-slate-500 mt-0.5">Consulta y administra</p>
          </div>
          <ChevronRight className="text-slate-300 group-hover:text-teal-500 transition-colors" size={20} />
        </button>

        {/* Card: Expedientes */}
        <button className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
            <FileText size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Expedientes</h3>
            <p className="text-sm text-slate-500 mt-0.5">Revisa historiales</p>
          </div>
          <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" size={20} />
        </button>

      </div>

      {/* Main Feed Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-slide-up delay-200 mt-2">

        {/* Left Column (Appointments) */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Próximas citas hoy</h2>
            <button className="text-blue-600 font-semibold text-sm hover:underline">Ver agenda completa</button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Appointment Row 1 */}
            <div className="flex items-center gap-4 p-3.5 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer active:scale-[0.99] shadow-sm">
              <div className="flex flex-col items-center justify-center min-w-[64px] h-12 bg-blue-50 rounded-lg text-blue-700 shrink-0">
                <span className="text-lg font-bold leading-none">10:00</span>
                <span className="text-[10px] font-bold mt-0.5 uppercase tracking-wide">AM</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <h3 className="font-semibold text-slate-900 text-base truncate">Maria Garcia</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <Clock size={14} className="shrink-0" /> Revisión general
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium hidden sm:block">Confirmada</div>
              <ChevronRight className="text-slate-300 shrink-0" size={20} />
            </div>

            {/* Appointment Row 2 */}
            <div className="flex items-center gap-4 p-3.5 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer active:scale-[0.99] shadow-sm">
              <div className="flex flex-col items-center justify-center min-w-[64px] h-12 bg-blue-50 rounded-lg text-blue-700 shrink-0">
                <span className="text-lg font-bold leading-none">11:30</span>
                <span className="text-[10px] font-bold mt-0.5 uppercase tracking-wide">AM</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <h3 className="font-semibold text-slate-900 text-base truncate">Carlos Ruiz</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <Clock size={14} className="shrink-0" /> Resultados de laboratorio
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium hidden sm:block">En sala</div>
              <ChevronRight className="text-slate-300 shrink-0" size={20} />
            </div>
          </div>
        </div>

        {/* Right Column (Weekly Overview & Activity) */}
        <div className="col-span-1 flex flex-col gap-6 animate-slide-up delay-300">

          {/* Weekly Overview Card (Compact) */}
          <div className="flex flex-col bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4 text-slate-900">
              <h3 className="font-bold text-base">Resumen de la semana</h3>
              <Calendar size={18} className="text-slate-400" />
            </div>
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-slate-900">24</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1">Pacientes</span>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-blue-600">12</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1">Horas</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-slate-900">Actividad reciente</h2>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col gap-4">
              <div className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0"></div>
                <p className="text-sm text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-900">Resultados</span> para Carlos Ruiz ya están disponibles.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                <p className="text-sm text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-900">Dra. Silva</span> actualizó el protocolo clínico.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></div>
                <p className="text-sm text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-900">Nuevo paciente</span> registrado en el sistema.
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
