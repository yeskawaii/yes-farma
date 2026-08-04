import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
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
import { DailyView } from './components/DailyView';
import { WeeklyView } from './components/WeeklyView';
import { AppointmentDetailModal } from './components/AppointmentDetailModal';

type ViewMode = 'daily' | 'weekly';

export function AppointmentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [currentDate, setCurrentDate] = useState<CivilDate>(getCivilDate());

  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const requestCounter = useRef(0);

  const fetchAppointments = async () => {
    const currentRequestId = ++requestCounter.current;

    try {
      setLoading(true);
      setError(null);

      const { startAt, endAt } = viewMode === 'daily'
        ? getDailyRange(currentDate)
        : getWeeklyRange(currentDate);

      const res = await appointmentsApi.list({ startAt, endAt });

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
    fetchAppointments();
  }, [currentDate, viewMode]);

  const handlePrev = () => {
    setCurrentDate(prev => addDaysCivil(prev, viewMode === 'daily' ? -1 : -7));
  };

  const handleNext = () => {
    setCurrentDate(prev => addDaysCivil(prev, viewMode === 'daily' ? 1 : 7));
  };

  const handleToday = () => {
    setCurrentDate(getCivilDate());
  };

  return (
    <div className="flex flex-col gap-6 animate-slide-up h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Agenda</h1>
          <p className="text-slate-500 mt-1">Gestiona las citas programadas en la clínica.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-20">

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
            <div className="px-4 py-2 font-semibold text-slate-900 text-sm min-w-[140px] text-center capitalize">
              {viewMode === 'daily'
                ? formatDate(civilDateToUtcMidnight(currentDate))
                : `Semana del ${civilDateToUtcMidnight(getStartOfWeekCivil(currentDate)).getDate()}`}
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
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Día
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'weekly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Semana
          </button>
        </div>
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
          viewMode === 'daily' ? (
            <DailyView
              date={currentDate}
              appointments={appointments}
              onSelectAppointment={setSelectedAppointmentId}
            />
          ) : (
            <WeeklyView
              startDate={getStartOfWeekCivil(currentDate)}
              appointments={appointments}
              onSelectAppointment={setSelectedAppointmentId}
            />
          )
        )}
      </div>

      {/* Detail Modal */}
      {selectedAppointmentId && (
        <AppointmentDetailModal
          id={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}
    </div>
  );
}
