import { X, Clock, User, Stethoscope, FileText, AlertCircle, RefreshCw, Edit, Check, Play, CheckCircle2, UserX, Ban } from 'lucide-react';
import { useState, useEffect } from 'react';
import { appointmentsApi } from '../api';
import type { AppointmentDetail, AppointmentStatus, UpdateAppointmentStatusInput } from '../types';
import { formatTime, formatDate } from '../utils/date';
import { useAuth } from '../../../core/auth/AuthProvider';
import { AppointmentFormModal } from './AppointmentFormModal';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';
import { StatusConfirmationDialog } from './StatusConfirmationDialog';

interface AppointmentDetailModalProps {
  id: string;
  onClose: () => void;
  onSuccess: () => void; // Trigger list refresh
}

const statusMap: Record<AppointmentStatus, { label: string, color: string }> = {
  SCHEDULED: { label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  CONFIRMED: { label: 'Confirmada', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS: { label: 'En atención', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200' },
  NO_SHOW: { label: 'No asistió', color: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export function AppointmentDetailModal({ id, onClose, onSuccess }: AppointmentDetailModalProps) {
  const { activeRole, memberships, activeClinicId } = useAuth();
  const userMembershipId = memberships.find(m => m.clinicId === activeClinicId)?.id;

  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{ open: boolean; status: UpdateAppointmentStatusInput['status'] | null }>({ open: false, status: null });

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

  const handleActionSuccess = () => {
    fetchDetail();
    onSuccess();
  };

  // Permisos y acciones
  let canEdit = false;
  let canCancel = false;
  let canConfirm = false;
  let canStart = false;
  let canComplete = false;
  let canNoShow = false;

  if (detail) {
    const isMine = detail.professionalMembershipId === userMembershipId;
    const isOwnerOrAss = activeRole === 'OWNER' || activeRole === 'ASSISTANT';
    const isProfAndMine = activeRole === 'PROFESSIONAL' && isMine;
    const isProfOwner = activeRole === 'OWNER' || isProfAndMine;

    // Edit
    if (['SCHEDULED', 'CONFIRMED'].includes(detail.status)) {
      if (isOwnerOrAss || isProfAndMine) canEdit = true;
    }

    // Cancel
    if (['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(detail.status)) {
      if (activeRole === 'OWNER' || isProfAndMine) canCancel = true;
      if (activeRole === 'ASSISTANT' && ['SCHEDULED', 'CONFIRMED'].includes(detail.status)) canCancel = true;
    }

    // Status transitions
    if (detail.status === 'SCHEDULED') {
      if (isOwnerOrAss || isProfAndMine) {
        canConfirm = true;
        canNoShow = true;
      }
      if (isProfOwner) canStart = true;
    } else if (detail.status === 'CONFIRMED') {
      if (isOwnerOrAss || isProfAndMine) canNoShow = true;
      if (isProfOwner) canStart = true;
    } else if (detail.status === 'IN_PROGRESS') {
      if (isProfOwner) canComplete = true;
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
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

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <button onClick={() => setIsEditOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors">
                      <Edit size={16} /> Editar
                    </button>
                  )}
                  {canConfirm && (
                    <button onClick={() => setStatusConfirm({ open: true, status: 'CONFIRMED' })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors">
                      <Check size={16} /> Confirmar
                    </button>
                  )}
                  {canStart && (
                    <button onClick={() => setStatusConfirm({ open: true, status: 'IN_PROGRESS' })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors">
                      <Play size={16} /> Iniciar
                    </button>
                  )}
                  {canComplete && (
                    <button onClick={() => setStatusConfirm({ open: true, status: 'COMPLETED' })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors">
                      <CheckCircle2 size={16} /> Completar
                    </button>
                  )}
                  {canNoShow && (
                    <button onClick={() => setStatusConfirm({ open: true, status: 'NO_SHOW' })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors">
                      <UserX size={16} /> No asistió
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => setIsCancelOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors ml-auto">
                      <Ban size={16} /> Cancelar cita
                    </button>
                  )}
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

      {/* Modals on top */}
      {detail && (
        <>
          <AppointmentFormModal
            isOpen={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            onSuccess={handleActionSuccess}
            editAppointment={detail}
          />
          <CancelAppointmentDialog
            isOpen={isCancelOpen}
            onClose={() => setIsCancelOpen(false)}
            onSuccess={handleActionSuccess}
            appointmentId={detail.id}
            patientName={`${detail.patient.firstName} ${detail.patient.lastName}`}
            appointmentDateTime={`${formatDate(detail.startAt)} a las ${formatTime(detail.startAt)}`}
          />
          {statusConfirm.status && (
            <StatusConfirmationDialog
              isOpen={statusConfirm.open}
              onClose={() => setStatusConfirm({ open: false, status: null })}
              onSuccess={handleActionSuccess}
              appointmentId={detail.id}
              patientName={`${detail.patient.firstName} ${detail.patient.lastName}`}
              newStatus={statusConfirm.status}
            />
          )}
        </>
      )}
    </>
  );
}
