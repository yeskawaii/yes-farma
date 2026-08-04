import type { AppointmentListItem, AppointmentStatus } from '../types';
import { formatTime } from '../utils/date';
import { Clock } from 'lucide-react';

interface AppointmentCardProps {
  appointment: AppointmentListItem;
  onClick: (id: string) => void;
  className?: string;
  compact?: boolean;
}

const statusMap: Record<AppointmentStatus, { label: string, color: string, dot: string }> = {
  SCHEDULED: { label: 'Programada', color: 'bg-blue-50 border-blue-200 hover:border-blue-300', dot: 'bg-blue-500' },
  CONFIRMED: { label: 'Confirmada', color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-300', dot: 'bg-indigo-500' },
  IN_PROGRESS: { label: 'En atención', color: 'bg-amber-50 border-amber-200 hover:border-amber-300', dot: 'bg-amber-500' },
  COMPLETED: { label: 'Completada', color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelada', color: 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-60', dot: 'bg-slate-400' },
  NO_SHOW: { label: 'No asistió', color: 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-60', dot: 'bg-slate-400' }
};

export function AppointmentCard({ appointment, onClick, className = '', compact = false }: AppointmentCardProps) {
  const { color, dot, label } = statusMap[appointment.status];

  return (
    <button
      type="button"
      onClick={() => onClick(appointment.id)}
      className={`border rounded-lg p-3 text-left cursor-pointer transition-all active:scale-[0.98] ${color} ${className} w-full focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0 max-w-full overflow-hidden whitespace-normal break-normal`}
      aria-label={`Cita ${label} de ${formatTime(appointment.startAt)} a ${formatTime(appointment.endAt)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
        {compact ? (
          <div className="flex flex-col text-slate-600 font-medium text-xs min-w-0 shrink-0 leading-tight">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Clock size={14} className="shrink-0" />
              <span>{formatTime(appointment.startAt)}</span>
            </div>
            <div className="pl-[20px] whitespace-nowrap">
              <span>- {formatTime(appointment.endAt)}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-600 font-medium text-xs whitespace-nowrap shrink-0">
            <Clock size={14} className="shrink-0" />
            <span>{formatTime(appointment.startAt)} - {formatTime(appointment.endAt)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`}></div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-normal text-left break-words">{label}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="font-semibold text-slate-900 text-sm truncate">
          {appointment.patient.firstName} {appointment.patient.lastName} {appointment.patient.secondLastName || ''}
        </h4>
        <p className="text-[11px] font-medium text-slate-600 truncate mb-1">
          Atiende: {appointment.professionalMembership.user.firstName} {appointment.professionalMembership.user.lastName}
        </p>
        {appointment.reason ? (
          <p className="text-xs text-slate-500 truncate">{appointment.reason}</p>
        ) : (
          <p className="text-xs text-slate-400 italic">Sin motivo especificado</p>
        )}
      </div>
    </button>
  );
}
