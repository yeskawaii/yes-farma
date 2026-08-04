import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../core/auth/AuthProvider';
import { PatientSelector } from './PatientSelector';
import { ProfessionalSelector } from './ProfessionalSelector';
import { appointmentsApi, getAppointmentErrorMessage } from '../api';
import { getClinicCivilDate, getClinicTime, civilDateAndTimeToIso } from '../utils/date';
import type { AppointmentDetail } from '../types';

interface AppointmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  editAppointment?: AppointmentDetail;
}

export function AppointmentFormModal({ isOpen, onClose, onSuccess, initialDate, editAppointment }: AppointmentFormModalProps) {
  const { activeRole, memberships, activeClinicId } = useAuth();

  const [patientId, setPatientId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editAppointment;
  const userMembershipId = memberships.find(m => m.clinicId === activeClinicId)?.id;

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        setPatientId(editAppointment.patientId);
        setProfessionalId(editAppointment.professionalMembershipId);
        setDate(getClinicCivilDate(editAppointment.startAt));
        setStartTime(getClinicTime(editAppointment.startAt));
        setEndTime(getClinicTime(editAppointment.endAt));
        setReason(editAppointment.reason || '');
        setNotes(editAppointment.administrativeNotes || '');
      } else {
        setPatientId('');
        setProfessionalId('');
        setDate(initialDate || getClinicCivilDate(new Date().toISOString()));
        setStartTime('');
        setEndTime('');
        setReason('');
        setNotes('');
      }
      setError(null);
    }
  }, [isOpen, isEditing, editAppointment, initialDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return setError('Selecciona un paciente.');
    if (!professionalId) return setError('Selecciona un profesional.');
    if (!date) return setError('Selecciona una fecha válida.');
    if (!startTime) return setError('Selecciona la hora de inicio.');
    if (!endTime) return setError('Selecciona la hora de término.');

    if (startTime >= endTime) {
      return setError('La hora de término debe ser posterior a la hora de inicio.');
    }

    setSubmitting(true);
    setError(null);

    try {
      const startAtIso = civilDateAndTimeToIso(date, startTime);
      const endAtIso = civilDateAndTimeToIso(date, endTime);

      const startMs = new Date(startAtIso).getTime();
      const endMs = new Date(endAtIso).getTime();
      const nowMs = Date.now();

      if (startMs < nowMs && (!isEditing || startAtIso !== editAppointment.startAt)) {
        setSubmitting(false);
        return setError('No puedes programar una cita en un horario pasado.');
      }

      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      if (startMs - nowMs > oneYearMs) {
        setSubmitting(false);
        return setError('No puedes programar una cita con más de un año de anticipación.');
      }

      const diffMins = (endMs - startMs) / 60000;

      if (diffMins < 10) {
        setSubmitting(false);
        return setError('La cita debe durar al menos 10 minutos.');
      }
      if (diffMins > 480) {
        setSubmitting(false);
        return setError('La cita no puede durar más de 8 horas.');
      }

      if (reason.length > 300) {
        setSubmitting(false);
        return setError('El motivo no puede exceder los 300 caracteres.');
      }
      if (notes.length > 1000) {
        setSubmitting(false);
        return setError('Las notas no pueden exceder los 1000 caracteres.');
      }

      if (isEditing) {
        await appointmentsApi.update(editAppointment.id, {
          professionalMembershipId: professionalId,
          startAt: startAtIso,
          endAt: endAtIso,
          reason: reason || null,
          administrativeNotes: notes || null,
        });
      } else {
        await appointmentsApi.create({
          patientId,
          professionalMembershipId: professionalId,
          startAt: startAtIso,
          endAt: endAtIso,
          reason: reason || undefined,
          administrativeNotes: notes || undefined,
        });
      }
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const fallback = isEditing
        ? 'No fue posible actualizar la cita. Inténtalo nuevamente.'
        : 'No fue posible guardar la cita. Inténtalo nuevamente.';
      setError(getAppointmentErrorMessage(error, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">{isEditing ? 'Editar cita' : 'Nueva cita'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Cerrar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded border border-red-200">
              {error}
            </div>
          )}

          <PatientSelector
            value={patientId}
            onChange={setPatientId}
            disabled={isEditing || submitting}
            initialPatient={isEditing ? editAppointment?.patient : undefined}
          />

          <ProfessionalSelector
            value={professionalId}
            onChange={setProfessionalId}
            disabled={isEditing && activeRole === 'PROFESSIONAL' || submitting}
            userRole={activeRole}
            userMembershipId={userMembershipId}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio</label>
              <input
                type="time"
                className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora término</label>
              <input
                type="time"
                className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo <span className="text-gray-400 font-normal">(Opcional)</span>
            </label>
            <textarea
              className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas administrativas <span className="text-gray-400 font-normal">(Opcional)</span>
            </label>
            <textarea
              className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={submitting}
            />
          </div>
        </form>

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
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
