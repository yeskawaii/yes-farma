import { useState } from 'react';
import { appointmentsApi, getAppointmentErrorMessage } from '../api';
import type { UpdateAppointmentStatusInput } from '../types';

interface StatusConfirmationDialogProps {
  isOpen: boolean;
  appointmentId: string;
  patientName: string;
  newStatus: UpdateAppointmentStatusInput['status'];
  onClose: () => void;
  onSuccess: () => void;
}

export function StatusConfirmationDialog({ isOpen, appointmentId, patientName, newStatus, onClose, onSuccess }: StatusConfirmationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await appointmentsApi.updateStatus(appointmentId, { status: newStatus });
      onSuccess();
      onClose();
    } catch (error: unknown) {
      setError(getAppointmentErrorMessage(error, 'No fue posible cambiar el estado de la cita. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  let title = '';
  let message = '';
  let confirmText = '';
  let confirmColor = 'bg-blue-600 hover:bg-blue-700';

  if (newStatus === 'NO_SHOW') {
    title = 'Confirmar inasistencia';
    message = `¿Estás seguro que deseas registrar que ${patientName} no asistió a la cita?`;
    confirmText = 'Registrar inasistencia';
    confirmColor = 'bg-orange-600 hover:bg-orange-700';
  } else if (newStatus === 'CONFIRMED') {
    title = 'Confirmar cita';
    message = `¿Confirmar la asistencia de ${patientName}?`;
    confirmText = 'Confirmar cita';
  } else if (newStatus === 'IN_PROGRESS') {
    title = 'Iniciar atención';
    message = `¿Deseas iniciar la atención de ${patientName}?`;
    confirmText = 'Iniciar atención';
    confirmColor = 'bg-green-600 hover:bg-green-700';
  } else if (newStatus === 'COMPLETED') {
    title = 'Completar cita';
    message = `¿Deseas marcar la cita de ${patientName} como completada?`;
    confirmText = 'Completar cita';
    confirmColor = 'bg-teal-600 hover:bg-teal-700';
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true">
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
    </div>
  );
}
