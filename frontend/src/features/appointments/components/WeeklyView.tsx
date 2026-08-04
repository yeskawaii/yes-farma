import type { AppointmentListItem } from '../types';
import { AppointmentCard } from './AppointmentCard';
import { addDaysCivil, getCivilDate, formatShortDateCivil, civilDateToUtcMidnight } from '../utils/date';
import type { CivilDate } from '../utils/date';

interface WeeklyViewProps {
  startDate: CivilDate; // Should be the first day of the week
  appointments: AppointmentListItem[];
  onSelectAppointment: (id: string) => void;
}

export function WeeklyView({ startDate, appointments, onSelectAppointment }: WeeklyViewProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysCivil(startDate, i));
  const today = getCivilDate();

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/*
        Use a horizontal scrollable container on mobile.
        On desktop, it uses CSS Grid with 7 columns.
      */}
      <div className="overflow-x-auto min-h-[500px]">
        <div className="min-w-[900px] grid grid-cols-7 divide-x divide-slate-100">
          {days.map((day, index) => {
            const dayAppointments = appointments.filter(app => getCivilDate(app.startAt) === day);
            const isToday = day === today;
            const midnight = civilDateToUtcMidnight(day);

            return (
              <div key={index} className="flex flex-col">
                {/* Column Header */}
                <div className={`p-3 text-center border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10 ${isToday ? 'border-b-blue-500' : ''}`}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {formatShortDateCivil(day).split(' ')[0]}
                  </p>
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'}`}>
                    {midnight.getUTCDate()}
                  </div>
                </div>

                {/* Column Body */}
                <div className="flex-1 p-2 flex flex-col gap-2 bg-slate-50/30">
                  {dayAppointments.length === 0 ? (
                    <div className="flex items-center justify-center h-full min-h-[100px]">
                      <span className="text-xs text-slate-300 italic">Sin citas</span>
                    </div>
                  ) : (
                    dayAppointments.map(app => (
                      <AppointmentCard
                        key={app.id}
                        appointment={app}
                        onClick={onSelectAppointment}
                        className="shadow-sm"
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
