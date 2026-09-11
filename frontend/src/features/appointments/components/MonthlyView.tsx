import type { AppointmentListItem } from '../types';
import { formatCalendarDate, formatTime, getClinicTime, getCivilDate, getMonthDays } from '../utils/date';
import { appointmentStatusMap } from '../utils/status';
import { Plus } from 'lucide-react';

interface MonthlyViewProps {
  date: string;
  appointments: AppointmentListItem[];
  onSelectAppointment: (id: string) => void;
  onSelectDay: (date: string) => void;
  onCreate?: (date: string) => void;
}

export function MonthlyView({ date, appointments, onSelectAppointment, onSelectDay, onCreate }: MonthlyViewProps) {
  const today = getCivilDate();
  const grouped = new Map<string, AppointmentListItem[]>();
  for (const appointment of appointments) {
    const day = getCivilDate(appointment.startAt);
    grouped.set(day, [...(grouped.get(day) || []), appointment]);
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {getMonthDays(date).map(day => {
          const items = (grouped.get(day) || []).sort((a, b) => a.startAt.localeCompare(b.startAt));
          const inMonth = day.slice(0, 7) === date.slice(0, 7);
          return (
            <div key={day} className={`group min-w-0 min-h-20 sm:min-h-28 border-b border-r border-slate-100 p-1 sm:p-2 ${inMonth ? 'bg-white' : 'bg-slate-50'} ${day === date ? 'ring-1 ring-inset ring-blue-300' : ''}`}>
              <div className="mb-1 flex items-center justify-between gap-1">
                <button onClick={() => onSelectDay(day)} aria-label={`Ver día ${formatCalendarDate(day)}, ${items.length} citas`} aria-current={day === today ? 'date' : undefined} className={`flex h-7 min-w-7 items-center justify-center rounded-full text-xs font-semibold hover:ring-2 hover:ring-blue-200 focus-visible:ring-2 ${day === today ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-800' : 'text-slate-400'}`}>
                  {Number(day.slice(-2))}
                </button>
                <span className="hidden sm:block ml-auto text-[10px] text-slate-500">{items.length > 0 && `${items.length} ${items.length === 1 ? 'cita' : 'citas'}`}</span>
                {onCreate && <button onClick={() => onCreate(day)} aria-label={`Nueva cita el ${formatCalendarDate(day)}`} className="hidden sm:flex rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 focus-visible:text-blue-600"><Plus size={14} /></button>}
              </div>
              <div className="hidden sm:flex flex-col gap-0.5">
                {items.slice(0, 3).map(item => {
                  const status = appointmentStatusMap[item.status];
                  const name = `${item.patient.firstName} ${item.patient.lastName}`;
                  return <button key={item.id} onClick={() => onSelectAppointment(item.id)} title={`${formatTime(item.startAt)} · ${name} · ${status.label} · ${item.professionalMembership.user.firstName} ${item.professionalMembership.user.lastName}`} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-left text-[11px] focus-visible:ring-2 focus-visible:ring-blue-500 ${status.color}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                    <span className="shrink-0 font-semibold text-slate-700">{getClinicTime(item.startAt)}</span>
                    <span className="truncate text-slate-700">{name}</span>
                    <span className="sr-only">{status.label}</span>
                  </button>;
                })}
                {items.length > 3 && <button onClick={() => onSelectDay(day)} className="rounded px-1 py-0.5 text-left text-xs font-medium text-blue-600 hover:bg-blue-50">+{items.length - 3} más</button>}
              </div>
              {items.length > 0 && <button onClick={() => onSelectDay(day)} aria-label={`Ver ${items.length} citas del ${formatCalendarDate(day)}`} className="sm:hidden flex w-full flex-col items-center gap-1 rounded py-1 text-[10px] text-slate-600">
                <span>{items.length} citas</span>
                <span className="flex gap-0.5">{Array.from(new Set(items.map(item => item.status))).map(status => <span key={status} className={`h-1.5 w-1.5 rounded-full ${appointmentStatusMap[status].dot}`} />)}</span>
              </button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
