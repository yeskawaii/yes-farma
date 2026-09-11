import type { AppointmentListItem } from '../types';
import { formatTime } from '../utils/date';
import { appointmentStatusMap } from '../utils/status';
import { Clock } from 'lucide-react';

interface AppointmentCardProps {
  appointment: AppointmentListItem;
  onClick: (id: string) => void;
  className?: string;
  compact?: boolean;
}


export function AppointmentCard({ appointment, onClick, className = '', compact = false }: AppointmentCardProps) {
  const { color, dot, label } = appointmentStatusMap[appointment.status];

  return (
    <button
      type="button"
      onClick={() => onClick(appointment.id)}
      className={`border rounded-lg p-3 text-left cursor-pointer transition-all active:scale-[0.98] ${color} ${className} ${compact ? '' : 'sm:flex sm:items-center sm:gap-6'} w-full focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0 max-w-full overflow-hidden whitespace-normal break-normal`}
      aria-label={`${appointment.patient.firstName} ${appointment.patient.lastName}, cita ${label} de ${formatTime(appointment.startAt)} a ${formatTime(appointment.endAt)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2 sm:mb-0">
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

      <div className={`flex min-w-0 flex-1 flex-col gap-1 ${compact ? '' : 'sm:grid sm:grid-cols-3 sm:items-center sm:gap-4'}`}>
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
