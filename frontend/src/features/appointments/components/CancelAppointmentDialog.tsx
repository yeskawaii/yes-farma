import { useState } from 'react';
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
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCancel = async () => {
    if (reason.length > 500) {
      return setError('El motivo no puede exceder los 500 caracteres.');
    }

    setSubmitting(true);
    setError(null);
    try {
      await appointmentsApi.cancel(appointmentId, { cancellationReason: reason || undefined });
      onSuccess();
      onClose();
    } catch (error: unknown) {
      setError(getAppointmentErrorMessage(error, 'No fue posible cancelar la cita. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-red-600">Cancelar Cita</h2>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded border border-red-200 text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-700">
            ¿Estás seguro que deseas cancelar la cita de <strong>{patientName}</strong> el <strong>{appointmentDateTime}</strong>?
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo de cancelación <span className="text-gray-400 font-normal">(Opcional)</span>
            </label>
            <textarea
              className="w-full border rounded p-2 text-sm focus:ring-red-500 focus:border-red-500"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={submitting}
              placeholder="Ej: El paciente llamó para cancelar..."
            />
            <div className={`text-xs text-right mt-1 ${reason.length >= 500 ? 'text-red-500' : 'text-gray-500'}`}>
              {reason.length}/500
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end space-x-2 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100"
            disabled={submitting}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? 'Cancelando...' : 'Cancelar cita'}
          </button>
        </div>
      </div>
    </div>
  );
}
