import type { AppointmentStatus } from '../types';

export const appointmentStatusMap: Record<AppointmentStatus, { label: string, color: string, dot: string }> = {
  SCHEDULED: { label: 'Programada', color: 'bg-blue-50 border-blue-200 hover:border-blue-300', dot: 'bg-blue-500' },
  CONFIRMED: { label: 'Confirmada', color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-300', dot: 'bg-indigo-500' },
  IN_PROGRESS: { label: 'En atención', color: 'bg-amber-50 border-amber-200 hover:border-amber-300', dot: 'bg-amber-500' },
  COMPLETED: { label: 'Completada', color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-50 border-red-200 hover:border-red-300', dot: 'bg-red-500' },
  NO_SHOW: { label: 'No asistió', color: 'bg-slate-50 border-slate-200 hover:border-slate-300', dot: 'bg-slate-400' }
};

