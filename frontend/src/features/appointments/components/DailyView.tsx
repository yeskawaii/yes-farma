import type { AppointmentListItem } from '../types';
import { AppointmentCard } from './AppointmentCard';
import { getCivilDate } from '../utils/date';
import type { CivilDate } from '../utils/date';
import { CalendarX2 } from 'lucide-react';

interface DailyViewProps {
  date: CivilDate;
  appointments: AppointmentListItem[];
  onSelectAppointment: (id: string) => void;
}

export function DailyView({ date, appointments, onSelectAppointment }: DailyViewProps) {
  // Filter appointments for this specific day using civil date equality
  const dailyAppointments = appointments.filter(app => getCivilDate(app.startAt) === date).sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <div className="flex flex-col gap-4">
      {dailyAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-3">
            <CalendarX2 size={32} />
          </div>
          <h3 className="text-slate-900 font-bold text-lg">Sin citas para mostrar</h3>
          <p className="text-slate-500 max-w-sm mt-1">
            No hay citas para este día con los filtros actuales.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {dailyAppointments.map(app => (
            <AppointmentCard
              key={app.id}
              appointment={app}
              onClick={onSelectAppointment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
