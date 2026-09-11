import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { appointmentsApi } from './api';
import type { AppointmentListItem } from './types';
import {
  getCivilDate,
  addDaysCivil,
  getStartOfWeekCivil,
  getDailyRange,
  getWeeklyRange,
  formatDate,
  civilDateToUtcMidnight
} from './utils/date';
import type { CivilDate } from './utils/date';
import { MonthlyView } from './components/MonthlyView';
import { appointmentStatusMap } from './utils/status';
import { addMonthsCivil, getMonthlyRanges, formatMonthCivil, formatCalendarDate } from './utils/date';
import { DailyView } from './components/DailyView';
import { WeeklyView } from './components/WeeklyView';
import { AppointmentDetailModal } from './components/AppointmentDetailModal';
import { AppointmentFormModal } from './components/AppointmentFormModal';
import { useAuth } from '../../core/auth/AuthProvider';

type ViewMode = 'daily' | 'weekly' | 'monthly';

export function AppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeRole, activeClinicId } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [currentDate, setCurrentDate] = useState<CivilDate>(getCivilDate());

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsFormOpen(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      }, { replace: true });
    }

    const apptId = searchParams.get('appointment');
    setSelectedAppointmentId(apptId);
  }, [searchParams, setSearchParams]);

  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [professionalFilter, setProfessionalFilter] = useState('');
  const filteredAppointments = appointments.filter(a => (!statusFilter || a.status === statusFilter) && (!professionalFilter || a.professionalMembershipId === professionalFilter));
  const professionals = [...new Map(appointments.map(a => [a.professionalMembershipId, a.professionalMembership.user])).entries()];
  const canCreate = ['OWNER', 'ASSISTANT', 'PROFESSIONAL'].includes(activeRole || '');
  const selectDay = (date: CivilDate) => { setCurrentDate(date); setViewMode('daily'); };
  const createOnDay = (date: CivilDate) => { setCurrentDate(date); setIsFormOpen(true); };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestCounter = useRef(0);

  const fetchAppointments = async () => {
    const currentRequestId = ++requestCounter.current;

    try {
      setLoading(true);
      setError(null);

      const ranges = viewMode === 'monthly' ? getMonthlyRanges(currentDate) : [viewMode === 'daily' ? getDailyRange(currentDate) : getWeeklyRange(currentDate)];
      const results = await Promise.all(ranges.map(range => appointmentsApi.list(range)));
      const res = [...new Map(results.flat().map(item => [item.id, item])).values()].sort((a, b) => a.startAt.localeCompare(b.startAt));

      if (currentRequestId === requestCounter.current) {
        setAppointments(res);
        setLoading(false);
      }
    } catch (err) {
      if (currentRequestId === requestCounter.current) {
        setError('Error al cargar la agenda. Por favor, intenta de nuevo.');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setAppointments([]);
    setStatusFilter('');
    setProfessionalFilter('');
  }, [activeClinicId]);

  useEffect(() => {
    fetchAppointments();
    return () => { requestCounter.current++; };
  }, [currentDate, viewMode, activeClinicId]);

  const handlePrev = () => {
    setCurrentDate(prev => viewMode === 'monthly' ? addMonthsCivil(prev, -1) : addDaysCivil(prev, viewMode === 'daily' ? -1 : -7));
  };

  const handleNext = () => {
    setCurrentDate(prev => viewMode === 'monthly' ? addMonthsCivil(prev, 1) : addDaysCivil(prev, viewMode === 'daily' ? 1 : 7));
  };

  const handleToday = () => {
    setCurrentDate(getCivilDate());
  };

  return (
    <div className="flex flex-col gap-4 animate-slide-up h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona las citas programadas en la clínica.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} /> Nueva cita
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">

        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm transition-colors mr-2"
          >
            Hoy
          </button>

          <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={handlePrev}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors border-r border-slate-200"
              aria-label="Anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-2 sm:px-4 py-2 font-semibold text-slate-900 text-xs sm:text-sm text-center capitalize">
              {viewMode === 'daily'
                ? formatDate(civilDateToUtcMidnight(currentDate))
                : viewMode === 'monthly' ? formatMonthCivil(currentDate) : `${formatCalendarDate(getStartOfWeekCivil(currentDate))} – ${formatCalendarDate(addDaysCivil(getStartOfWeekCivil(currentDate), 6))}`}
            </div>
            <button
              onClick={handleNext}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors border-l border-slate-200"
              aria-label="Siguiente"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg">
          {([['daily', 'Día'], ['weekly', 'Semana'], ['monthly', 'Mes']] as const).map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode} className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-slate-500">Estado
          <select aria-label="Filtrar por estado" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="max-w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
            <option value="">Todos</option>
            {Object.entries(appointmentStatusMap).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-slate-500">Profesional
          <select aria-label="Filtrar por profesional" value={professionalFilter} onChange={e => setProfessionalFilter(e.target.value)} className="max-w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
            <option value="">Todos</option>
            {professionalFilter && !professionals.some(([id]) => id === professionalFilter) && <option value={professionalFilter}>Seleccionado (sin citas)</option>}
            {professionals.map(([id, user]) => <option key={id} value={id}>{user.firstName} {user.lastName}</option>)}
          </select>
        </label>
        {(statusFilter || professionalFilter) && <button onClick={() => { setStatusFilter(''); setProfessionalFilter(''); }} className="text-blue-600 px-2 py-1.5">Limpiar filtros</button>}
        {!loading && !error && <span role="status" className="ml-auto text-xs text-slate-500">{filteredAppointments.length} citas{statusFilter || professionalFilter ? ' con estos filtros' : ' en el período visible'}</span>}
      </div>

      {/* Content Area */}
      <div className="flex-1">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="text-red-500" size={40} />
            <div>
              <h3 className="text-red-800 font-bold text-lg">Error al cargar</h3>
              <p className="text-red-600 mt-1">{error}</p>
            </div>
            <button
              onClick={fetchAppointments}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
            >
              <RefreshCw size={18} />
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin text-blue-500">
              <RefreshCw size={32} />
            </div>
          </div>
        ) : (
          viewMode === 'monthly' ? (
            <MonthlyView date={currentDate} appointments={filteredAppointments} onSelectAppointment={setSelectedAppointmentId} onSelectDay={selectDay} onCreate={canCreate ? createOnDay : undefined} />
          ) : viewMode === 'daily' ? (
            <DailyView
              date={currentDate}
              appointments={filteredAppointments}
              onSelectAppointment={setSelectedAppointmentId}
            />
          ) : (
            <WeeklyView
              startDate={getStartOfWeekCivil(currentDate)}
              appointments={filteredAppointments}
              onSelectAppointment={setSelectedAppointmentId}
            />
          )
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500" aria-label="Estados de cita">
        {Object.entries(appointmentStatusMap).map(([key, status]) => <span key={key} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}</span>)}
      </div>

      {/* Detail Modal */}
      {selectedAppointmentId && (
        <AppointmentDetailModal
          id={selectedAppointmentId}
          onClose={() => {
            setSelectedAppointmentId(null);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('appointment');
              return next;
            }, { replace: true });
          }}
          onSuccess={fetchAppointments}
        />
      )}

      {/* Form Modal */}
      <AppointmentFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={fetchAppointments}
        initialDate={currentDate}
      />
    </div>
  );
}
