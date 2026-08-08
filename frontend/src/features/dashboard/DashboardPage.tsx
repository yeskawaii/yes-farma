import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Plus, ChevronRight, FileText, Building2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { dashboardApi } from './api';
import type { DashboardResponse, DashboardUpcomingAppointment } from './types';

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No se presentó',
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  IN_PROGRESS: 'bg-purple-50 text-purple-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-red-50 text-red-700',
  NO_SHOW: 'bg-amber-50 text-amber-700',
};

export function DashboardPage() {
  const { user, memberships, activeClinicId } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestCounter = useRef(0);

  const activeMembership = memberships.find(m => m.clinicId === activeClinicId);
  const clinicName = activeMembership?.clinicName || 'Clínica';

  const fetchDashboard = async () => {
    if (!activeClinicId) return;
    const currentRequestId = ++requestCounter.current;

    try {
      setLoading(true);
      setError(null);
      const res = await dashboardApi.get();

      if (currentRequestId === requestCounter.current) {
        setData(res);
        setLoading(false);
      }
    } catch {
      if (currentRequestId === requestCounter.current) {
        setError('Error al cargar el dashboard.');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [activeClinicId]);

  const formatHour = (isoString: string, timeZone: string) => {
    try {
      const d = new Date(isoString);
      const parts = new Intl.DateTimeFormat('es-MX', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).formatToParts(d);

      const h = parts.find(p => p.type === 'hour')?.value || '--';
      const m = parts.find(p => p.type === 'minute')?.value || '--';
      const dp = parts.find(p => p.type === 'dayPeriod')?.value || '';

      return {
        time: `${h}:${m}`,
        dayPeriod: dp
      };
    } catch {
      return { time: '--:--', dayPeriod: '' };
    }
  };

  const formatMinutes = (mins: number) => {
    if (mins === 0) return '0 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} h ${m} min`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
        <AlertCircle className="text-red-500" size={40} />
        <div>
          <h3 className="text-red-800 font-bold text-lg">Error</h3>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
        >
          <RefreshCw size={18} />
          Reintentar
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin text-blue-500">
          <RefreshCw size={32} />
        </div>
      </div>
    );
  }

  const { scope, timeZone, today, upcomingAppointments, week } = data;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1.5 animate-slide-up">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Bienvenido, {user?.firstName || 'Usuario'}
        </h1>
        <div className="flex items-center gap-2 text-slate-500 text-lg">
          <Building2 size={18} />
          <p>{clinicName}</p>
        </div>
      </div>

      {/* Quick Actions Overview (Compact Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-100">
        <button
          type="button"
          onClick={() => navigate('/appointments?new=1')}
          className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24"
        >
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
            <Plus size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Nueva cita</h3>
            <p className="text-sm text-slate-500 mt-0.5">Agenda una consulta</p>
          </div>
          <ChevronRight className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20} />
        </button>

        <button
          type="button"
          onClick={() => navigate('/patients')}
          className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24"
        >
          <div className="w-12 h-12 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
            <Users size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Pacientes</h3>
            <p className="text-sm text-slate-500 mt-0.5">Consulta y administra</p>
          </div>
          <ChevronRight className="text-slate-300 group-hover:text-teal-500 transition-colors" size={20} />
        </button>

        {(scope === 'PERSONAL' || scope === 'CLINIC') && (
          <button
            type="button"
            onClick={() => navigate('/patients')}
            className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24"
          >
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
              <FileText size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-900">Expedientes</h3>
              <p className="text-sm text-slate-500 mt-0.5">Consulta historiales clínicos</p>
            </div>
            <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" size={20} />
          </button>
        )}

        {scope === 'CLINIC_ADMIN' && (
          <button
            type="button"
            onClick={() => navigate('/appointments')}
            className="flex flex-row items-center gap-4 w-full p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow group active:scale-[0.98] text-left h-24"
          >
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0">
              <Calendar size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-900">Agenda</h3>
              <p className="text-sm text-slate-500 mt-0.5">Gestiona las citas</p>
            </div>
            <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" size={20} />
          </button>
        )}
      </div>

      {/* Main Feed Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-slide-up delay-200 mt-2">
        {/* Left Column (Appointments) */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Próximas citas hoy</h2>
            <button
              type="button"
              onClick={() => navigate('/appointments')}
              className="text-blue-600 font-semibold text-sm hover:underline"
            >
              Ver agenda completa
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {upcomingAppointments.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-500 border border-slate-100">
                {scope === 'PERSONAL'
                  ? 'No tienes más citas programadas para hoy.'
                  : 'No hay próximas citas programadas para hoy.'}
              </div>
            ) : (
              upcomingAppointments.map((app: DashboardUpcomingAppointment) => {
                const formattedHour = formatHour(app.startAt, timeZone);

                return (
                  <button
                    type="button"
                    key={app.id}
                    onClick={() => navigate(`/appointments?appointment=${encodeURIComponent(app.id)}`)}
                    className="flex text-left items-center gap-4 p-3.5 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer active:scale-[0.99] shadow-sm w-full"
                  >
                    <div className="flex flex-col items-center justify-center min-w-[64px] h-12 bg-blue-50 rounded-lg text-blue-700 shrink-0">
                      <span className="text-lg font-bold leading-none">{formattedHour.time}</span>
                      <span className="text-[10px] font-bold mt-0.5 uppercase tracking-wide">{formattedHour.dayPeriod}</span>
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col justify-center">
                      <h3 className="font-semibold text-slate-900 text-base truncate">{app.patient.displayName}</h3>
                      {(scope === 'CLINIC' || scope === 'CLINIC_ADMIN') && (
                        <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                          <Users size={14} className="shrink-0" /> {app.professional.displayName}
                        </p>
                      )}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium hidden sm:block ${STATUS_COLORS[app.status] || 'bg-slate-100 text-slate-700'}`}>
                      {STATUS_LABELS[app.status] || app.status}
                    </div>
                    <ChevronRight className="text-slate-300 shrink-0" size={20} />
                  </button>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-blue-600">{today.appointmentsUpcoming}</span>
              <span className="text-xs font-medium uppercase text-slate-500 mt-1">Próximas</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-purple-600">{today.appointmentsInProgress}</span>
              <span className="text-xs font-medium uppercase text-slate-500 mt-1">En curso</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-700">{today.appointmentsCompleted}</span>
              <span className="text-xs font-medium uppercase text-slate-500 mt-1">Completadas</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">{today.appointmentsTotal}</span>
              <span className="text-xs font-medium uppercase text-slate-500 mt-1">Total Hoy</span>
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
                <span className="text-3xl font-bold text-slate-900">{week.patientsSeen}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1 text-center">Pacientes<br/>atendidos</span>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-blue-600">{formatMinutes(week.scheduledMinutes)}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1 text-center">Tiempo<br/>agendado</span>
              </div>
            </div>
          </div>

          {/* Secondary Panel */}
          {scope === 'PERSONAL' && 'pending' in data && (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-slate-900">Borradores clínicos pendientes</h2>
              <button
                type="button"
                onClick={() => navigate('/patients')}
                className="bg-white rounded-xl p-4 border border-slate-200 hover:border-blue-300 transition-colors shadow-sm flex flex-row items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${data.pending.draftClinicalEncounters > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                  <p className="text-sm font-medium text-slate-700">
                    {data.pending.draftClinicalEncounters === 0 && 'Sin borradores pendientes'}
                    {data.pending.draftClinicalEncounters === 1 && '1 borrador pendiente'}
                    {data.pending.draftClinicalEncounters > 1 && `${data.pending.draftClinicalEncounters} borradores pendientes`}
                  </p>
                </div>
                <ChevronRight className="text-slate-300 group-hover:text-blue-500" size={18} />
              </button>
            </div>
          )}

          {(scope === 'CLINIC' || scope === 'CLINIC_ADMIN') && 'patients' in data && (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-slate-900">Pacientes activos</h2>
              <button
                type="button"
                onClick={() => navigate('/patients')}
                className="bg-white rounded-xl p-4 border border-slate-200 hover:border-blue-300 transition-colors shadow-sm flex flex-row items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{data.patients.activeTotal}</p>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total en la clínica</p>
                  </div>
                </div>
                <ChevronRight className="text-slate-300 group-hover:text-blue-500" size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
