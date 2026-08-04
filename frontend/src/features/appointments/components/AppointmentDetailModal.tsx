import { X, Clock, User, Stethoscope, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { appointmentsApi } from '../api';
import type { AppointmentDetail, AppointmentStatus } from '../types';
import { formatTime, formatDate } from '../utils/date';

interface AppointmentDetailModalProps {
  id: string;
  onClose: () => void;
}

const statusMap: Record<AppointmentStatus, { label: string, color: string }> = {
  SCHEDULED: { label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  CONFIRMED: { label: 'Confirmada', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS: { label: 'En atención', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200' },
  NO_SHOW: { label: 'No asistió', color: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export function AppointmentDetailModal({ id, onClose }: AppointmentDetailModalProps) {
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await appointmentsApi.getById(id);
      setDetail(res);
    } catch (err) {
      setError('Error al cargar los detalles de la cita.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col relative animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            Detalle de Cita
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col gap-4 animate-pulse">
              <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
              <div className="h-20 bg-slate-100 rounded-xl"></div>
              <div className="h-20 bg-slate-100 rounded-xl"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl flex flex-col items-center justify-center gap-3 text-center border border-red-100">
              <AlertCircle size={32} className="text-red-500" />
              <p>{error}</p>
              <button onClick={fetchDetail} className="flex items-center gap-2 px-4 py-2 bg-white text-red-700 border border-red-200 rounded-lg hover:bg-red-50 font-medium text-sm transition-colors">
                <RefreshCw size={16} />
                Reintentar
              </button>
            </div>
          ) : detail ? (
            <div className="flex flex-col gap-6">

              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${statusMap[detail.status].color}`}>
                  {statusMap[detail.status].label}
                </span>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Fecha</p>
                  <p className="font-medium text-slate-900 capitalize">{formatDate(detail.startAt)}</p>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-start gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <Clock className="text-blue-500 mt-0.5 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-0.5">Horario</p>
                  <p className="font-semibold text-slate-900 text-lg">
                    {formatTime(detail.startAt)} - {formatTime(detail.endAt)}
                  </p>
                </div>
              </div>

              {/* Patient */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Paciente</p>
                  <p className="font-semibold text-slate-900">
                    {detail.patient.firstName} {detail.patient.lastName} {detail.patient.secondLastName || ''}
                  </p>
                  {(detail.patient.phone || detail.patient.email) && (
                    <p className="text-sm text-slate-500 mt-0.5">
                      {detail.patient.phone} {detail.patient.phone && detail.patient.email && '•'} {detail.patient.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Professional */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Profesional</p>
                  <p className="font-semibold text-slate-900">
                    {detail.professionalMembership.user.firstName} {detail.professionalMembership.user.lastName}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {detail.professionalMembership.user.email}
                  </p>
                </div>
              </div>

              {/* Reason */}
              {detail.reason && (
                <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <FileText className="text-slate-400 mt-0.5 shrink-0" size={20} />
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Motivo de consulta</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap">{detail.reason}</p>
                  </div>
                </div>
              )}

              {/* Admin Notes */}
              {detail.administrativeNotes && (
                <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <FileText className="text-amber-500 mt-0.5 shrink-0" size={20} />
                  <div>
                    <p className="text-xs text-amber-700 font-medium mb-0.5">Notas Administrativas</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{detail.administrativeNotes}</p>
                  </div>
                </div>
              )}

              {/* Cancellation Reason */}
              {detail.status === 'CANCELLED' && detail.cancellationReason && (
                <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl border border-red-100">
                  <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={20} />
                  <div>
                    <p className="text-xs text-red-700 font-medium mb-0.5">Motivo de cancelación</p>
                    <p className="text-sm text-red-900 whitespace-pre-wrap">{detail.cancellationReason}</p>
                  </div>
                </div>
              )}

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
