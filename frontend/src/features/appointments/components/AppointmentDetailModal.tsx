import { Modal } from '../../../shared/components/Modal/Modal';
import { X, Clock, User, Stethoscope, FileText, AlertCircle, RefreshCw, Edit, Check, Play, Eye, Loader2, UserX, Ban } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { appointmentsApi, getAppointmentErrorMessage } from '../api';
import type { AppointmentDetail } from '../types';
import { appointmentStatusMap } from '../utils/status';
import { formatTime, formatDate } from '../utils/date';
import { useAuth } from '../../../core/auth/AuthProvider';
import { AppointmentFormModal } from './AppointmentFormModal';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';

interface AppointmentDetailModalProps {
  id: string;
  onClose: () => void;
  onSuccess: () => void; // Trigger list refresh
}


export function AppointmentDetailModal({ id, onClose, onSuccess }: AppointmentDetailModalProps) {
  const navigate = useNavigate();
  const { activeRole, memberships, activeClinicId } = useAuth();
  const userMembershipId = memberships.find(m => m.clinicId === activeClinicId)?.id;

  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const updatingStatusRef = useRef(false);
  const [pendingStatus, setPendingStatus] = useState<'CONFIRMED' | 'NO_SHOW' | null>(null);
  const isUpdatingStatus = pendingStatus !== null;
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [isOpeningCare, setIsOpeningCare] = useState(false);
  const [careError, setCareError] = useState<string | null>(null);

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

  const handleOpenCare = async () => {
    if (!detail || isOpeningCare) return;

    try {
      setIsOpeningCare(true);
      setCareError(null);

      const result = await appointmentsApi.startCare(detail.id);

      onSuccess();

      navigate(
        `/patients/${encodeURIComponent(result.encounter.patientId)}/encounters/${encodeURIComponent(result.encounter.id)}`
      );
    } catch (error: unknown) {
      setCareError(
        getAppointmentErrorMessage(
          error,
          detail.status === 'SCHEDULED' || detail.status === 'CONFIRMED'
            ? 'No fue posible iniciar la atención.'
            : 'No fue posible abrir la atención.'
        )
      );
    } finally {
      setIsOpeningCare(false);
    }
  };

  // Permisos y acciones
  let canEdit = false;
  let canCancel = false;
  let canConfirm = false;
  let canNoShow = false;
  let careAction: 'START' | 'CONTINUE' | 'VIEW' | null = null;

  if (detail) {
    const isMine = detail.professionalMembershipId === userMembershipId;
    const isOwnerOrAss =
      activeRole === 'OWNER' || activeRole === 'ASSISTANT';
    const isProfAndMine =
      activeRole === 'PROFESSIONAL' && isMine;

    // OWNER no sustituye al profesional asignado:
    // para entrar al contexto clínico esta membresía debe ser
    // exactamente la responsable de la cita.
    const isClinicalAssignee =
      isMine &&
      (activeRole === 'OWNER' || activeRole === 'PROFESSIONAL');

    if (['SCHEDULED', 'CONFIRMED'].includes(detail.status)) {
      if (isOwnerOrAss || isProfAndMine) {
        canEdit = true;
      }
    }

    // Después de iniciar atención ya existe un encounter y la cita
    // deja de ser cancelable desde el flujo administrativo.
    if (['SCHEDULED', 'CONFIRMED'].includes(detail.status)) {
      if (
        activeRole === 'OWNER' ||
        activeRole === 'ASSISTANT' ||
        isProfAndMine
      ) {
        canCancel = true;
      }
    }

    if (detail.status === 'SCHEDULED') {
      if (isOwnerOrAss || isProfAndMine) {
        canConfirm = true;
        canNoShow = true;
      }

      if (isClinicalAssignee) {
        careAction = 'START';
      }
    } else if (detail.status === 'CONFIRMED') {
      if (isOwnerOrAss || isProfAndMine) {
        canNoShow = true;
      }

      if (isClinicalAssignee) {
        careAction = 'START';
      }
    } else if (detail.status === 'IN_PROGRESS') {
      if (isClinicalAssignee) {
        careAction = 'CONTINUE';
      }
    } else if (detail.status === 'COMPLETED') {
      if (isClinicalAssignee) {
        careAction = 'VIEW';
      }
    }
  }

  const handleStatusChange = async (status: 'CONFIRMED' | 'NO_SHOW') => {
    if (!detail || !(status === 'CONFIRMED' ? canConfirm : canNoShow) || updatingStatusRef.current || isOpeningCare) return;
    updatingStatusRef.current = true;
    setPendingStatus(status);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      const updated = await appointmentsApi.updateStatus(detail.id, { status });
      setDetail(updated);
      setStatusSuccess(status === 'CONFIRMED' ? 'Cita confirmada.' : 'Inasistencia registrada.');
      onSuccess();
    } catch (error: unknown) {
      setStatusError(getAppointmentErrorMessage(error, status === 'CONFIRMED' ? 'No fue posible confirmar la cita. Inténtalo nuevamente.' : 'No fue posible registrar la inasistencia. Inténtalo nuevamente.'));
    } finally {
      updatingStatusRef.current = false;
      setPendingStatus(null);
    }
  };

  return (
    <>
      <Modal onClose={onClose} closeOnBackdrop={false} closeOnEscape={!isUpdatingStatus} aria-label="Detalle de cita">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col relative animate-slide-up">
          {/* Header */}
          <div className="shrink-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between z-10 rounded-t-2xl">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Detalle de cita
            </h2>
            <button
              onClick={onClose}
              disabled={isUpdatingStatus}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-5">
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
              <div className="flex flex-col gap-4">

                {/* Patient */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">Paciente</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {detail.patient.firstName} {detail.patient.lastName} {detail.patient.secondLastName || ''}
                    </p>
                    {(detail.patient.phone || detail.patient.email) && (
                      <p className="text-sm text-slate-500 mt-0.5 break-all">
                        {detail.patient.phone} {detail.patient.phone && detail.patient.email && '•'} {detail.patient.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${appointmentStatusMap[detail.status].color}`}>
                    {appointmentStatusMap[detail.status].label}
                  </span>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Fecha</p>
                    <p className="font-medium text-slate-900 capitalize">{formatDate(detail.startAt)}</p>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <Clock className="text-blue-500 mt-0.5 shrink-0" size={20} />
                  <div>
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-0.5">Horario</p>
                    <p className="font-semibold text-slate-900 text-lg">
                      {formatTime(detail.startAt)} – {formatTime(detail.endAt)}
                      <span className="ml-2 text-sm font-normal text-slate-500">{Math.round((new Date(detail.endAt).getTime() - new Date(detail.startAt).getTime()) / 60000)} min</span>
                    </p>
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
                      <p className="text-sm text-slate-900 whitespace-pre-wrap break-words">{detail.reason}</p>
                    </div>
                  </div>
                )}

                {/* Admin Notes */}
                {detail.administrativeNotes && (
                  <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <FileText className="text-amber-500 mt-0.5 shrink-0" size={20} />
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-0.5">Notas administrativas</p>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap break-words">{detail.administrativeNotes}</p>
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

                {/* Actions */}
                {statusError && <div role="alert" className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">{statusError}</div>}
                {statusSuccess && <div role="status" className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">{statusSuccess}</div>}
                {careError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                    <AlertCircle
                      size={16}
                      className="shrink-0 mt-0.5"
                    />
                    <span>{careError}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {canEdit && (
                    <button disabled={isUpdatingStatus} onClick={() => setIsEditOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors">
                      <Edit size={16} /> Editar
                    </button>
                  )}
                  {canConfirm && (
                    <button onClick={() => void handleStatusChange('CONFIRMED')} disabled={isUpdatingStatus || isOpeningCare} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors">
                      {pendingStatus === 'CONFIRMED' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {pendingStatus === 'CONFIRMED' ? 'Confirmando...' : 'Confirmar'}
                    </button>
                  )}
                  {careAction && (
                    <button
                      onClick={() => void handleOpenCare()}
                      disabled={isOpeningCare || isUpdatingStatus}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        careAction === 'VIEW'
                          ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
                          : 'text-white bg-blue-600 hover:bg-blue-700 border-blue-600'
                      }`}
                    >
                      {isOpeningCare ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : careAction === 'VIEW' ? (
                        <Eye size={16} />
                      ) : (
                        <Play size={16} />
                      )}

                      {isOpeningCare
                        ? 'Abriendo...'
                        : careAction === 'START'
                          ? 'Iniciar atención'
                          : careAction === 'CONTINUE'
                            ? 'Continuar atención'
                            : 'Ver atención'}
                    </button>
                  )}
                  {canNoShow && (
                    <button disabled={isUpdatingStatus || isOpeningCare} onClick={() => void handleStatusChange('NO_SHOW')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors">
                      {pendingStatus === 'NO_SHOW' ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />} {pendingStatus === 'NO_SHOW' ? 'Registrando...' : 'No asistió'}
                    </button>
                  )}
                  {canCancel && (
                    <button disabled={isUpdatingStatus} onClick={() => setIsCancelOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white hover:bg-red-50 rounded-lg border border-red-200 transition-colors ml-auto">
                      <Ban size={16} /> Cancelar cita
                    </button>
                  )}
                </div>


              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Modals on top */}
      {detail && (
        <>
          <AppointmentFormModal
            isOpen={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            onSuccess={handleActionSuccess}
            editAppointment={detail}
          />
          {isCancelOpen && <CancelAppointmentDialog
            isOpen={isCancelOpen}
            onClose={() => setIsCancelOpen(false)}
            onSuccess={handleActionSuccess}
            appointmentId={detail.id}
            patientName={[detail.patient.firstName, detail.patient.lastName, detail.patient.secondLastName].filter(Boolean).join(' ')}
            appointmentDateTime={`${formatDate(detail.startAt)} a las ${formatTime(detail.startAt)}`}
          />}

        </>
      )}
    </>
  );
}
