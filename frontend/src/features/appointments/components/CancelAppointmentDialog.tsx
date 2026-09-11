import { Modal } from '../../../shared/components/Modal/Modal';
import { useId, useRef, useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { appointmentsApi, getAppointmentErrorMessage } from '../api';

interface CancelAppointmentDialogProps {
  isOpen: boolean;
  appointmentId: string;
  patientName: string;
  appointmentDateTime: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelAppointmentDialog({ isOpen, appointmentId, patientName, appointmentDateTime, onClose, onSuccess }: CancelAppointmentDialogProps) {
  const reasonId = useId();
  const submittingRef = useRef(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCancel = async () => {
    if (submittingRef.current) return;
    if (reason.length > 500) {
      return setError('El motivo no puede exceder los 500 caracteres.');
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await appointmentsApi.cancel(appointmentId, { cancellationReason: reason || undefined });
      onSuccess();
      onClose();
    } catch (error: unknown) {
      setError(getAppointmentErrorMessage(error, 'No fue posible cancelar la cita. Inténtalo nuevamente.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} closeOnBackdrop={false} closeOnEscape={!submitting} aria-label="Cancelar cita">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden" aria-busy={submitting}>
        <div className="px-5 pt-5 sm:px-6 sm:pt-6 flex items-center gap-3 shrink-0">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600"><Ban size={22} aria-hidden="true" /></div>
          <h2 className="text-xl font-semibold text-slate-900">Cancelar cita</h2>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <p className="text-sm leading-6 text-slate-600">
            La cita de <strong className="font-semibold text-slate-900">{patientName}</strong> del{' '}
            <strong className="font-semibold text-slate-900">{appointmentDateTime}</strong> será cancelada.
          </p>

          <div>
            <label htmlFor={reasonId} className="block text-sm font-medium text-slate-900 mb-2">
              Motivo de cancelación <span className="text-slate-500 font-normal">(opcional)</span>
            </label>
            <textarea
              id={reasonId}
              aria-describedby={`${reasonId}-count`}
              className="block w-full min-h-32 resize-y border border-slate-300 rounded-xl p-3 text-base sm:text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 disabled:bg-slate-50 disabled:text-slate-500"
              rows={4}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={submitting}
              placeholder="Escribe el motivo de la cancelación"
            />
            <div id={`${reasonId}-count`} className="text-xs text-right mt-2 text-slate-500">
              {reason.length}/500 caracteres
            </div>
          </div>
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-xl text-sm leading-5">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? 'Cancelando...' : 'Cancelar cita'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
