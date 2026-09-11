import { Modal } from '../../../shared/components/Modal/Modal';
import { useState } from 'react';
import { appointmentsApi, getAppointmentErrorMessage } from '../api';

interface StatusConfirmationDialogProps {
  isOpen: boolean;
  appointmentId: string;
  patientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function StatusConfirmationDialog({ isOpen, appointmentId, patientName, onClose, onSuccess }: StatusConfirmationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await appointmentsApi.updateStatus(appointmentId, { status: 'NO_SHOW' });
      onSuccess();
      onClose();
    } catch (error: unknown) {
      setError(getAppointmentErrorMessage(error, 'No fue posible cambiar el estado de la cita. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const title = 'Confirmar inasistencia';
  const message = `¿Estás seguro que deseas registrar que ${patientName} no asistió a la cita?`;
  const confirmText = 'Registrar inasistencia';
  const confirmColor = 'bg-orange-600 hover:bg-orange-700';

  return (
    <Modal onClose={onClose} closeOnBackdrop={false} closeOnEscape={!submitting} aria-label={title}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded border border-red-200 text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-700">
            {message}
          </p>
        </div>

        <div className="p-4 border-t flex justify-end space-x-2 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-white rounded disabled:opacity-50 ${confirmColor}`}
            disabled={submitting}
          >
            {submitting ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
