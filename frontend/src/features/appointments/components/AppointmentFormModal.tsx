import { Modal } from '../../../shared/components/Modal/Modal';
import React, { useState, useEffect, useId } from 'react';
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
  const formId = useId();
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
    if (submitting) return;
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

  const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const duration = startTime && endTime ? minutes(endTime) - minutes(startTime) : 0;
  const inputClass = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50';
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

  return (
    <Modal onClose={onClose} closeOnBackdrop={false} closeOnEscape={!submitting} aria-label={isEditing ? 'Editar cita' : 'Nueva cita'}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <div className="flex shrink-0 justify-between items-start gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{isEditing ? 'Editar cita' : 'Nueva cita'}</h2>
            <p className="mt-1 text-xs text-slate-500">{isEditing ? 'Actualiza los datos de la cita.' : 'Selecciona al paciente y define su horario de atención.'}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form id={formId} onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5 [&_select]:rounded-lg [&_select]:border-slate-300 [&_select]:px-3 [&_select]:py-2">
          {error && <div role="alert" className="p-3 text-sm bg-red-50 text-red-700 rounded-lg border border-red-200">{error}</div>}
          <section aria-label="Paciente de la cita">
            <PatientSelector value={patientId} onChange={setPatientId} disabled={isEditing || submitting} initialPatient={isEditing ? editAppointment?.patient : undefined} />
          </section>
          <fieldset className="space-y-3 border-t border-slate-100 pt-3">
            <legend className="pr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha y horario</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <label htmlFor={`${formId}-date`} className={labelClass}>Fecha</label>
                <input id={`${formId}-date`} type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} disabled={submitting} required />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${formId}-start`} className={labelClass}>Hora de inicio</label>
                <input id={`${formId}-start`} type="time" className={inputClass} value={startTime} onChange={e => setStartTime(e.target.value)} disabled={submitting} required />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${formId}-end`} className={labelClass}>Hora de término</label>
                <input id={`${formId}-end`} type="time" className={inputClass} value={endTime} onChange={e => setEndTime(e.target.value)} disabled={submitting} required />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Duración rápida:</span>
              {[30, 45, 60, 90].map(value => <button key={value} type="button" disabled={!startTime || submitting || minutes(startTime) + value >= 1440} onClick={() => { const end = minutes(startTime) + value; setEndTime(`${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`); }} aria-pressed={duration === value} className={`rounded-md border px-2 py-1 disabled:opacity-40 ${duration === value ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{value} min</button>)}
              <span className="ml-auto font-medium text-slate-700" aria-live="polite">{duration > 0 ? `${duration} min en total` : 'Define inicio y término'}</span>
            </div>
          </fieldset>
          <section aria-label="Profesional de la cita" className="border-t border-slate-100 pt-4">
            <ProfessionalSelector value={professionalId} onChange={setProfessionalId} disabled={isEditing && activeRole === 'PROFESSIONAL' || submitting} userRole={activeRole} userMembershipId={userMembershipId} />
          </section>
          <section aria-label="Información adicional" className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <label htmlFor={`${formId}-reason`} className={labelClass}>Motivo <span className="font-normal text-xs text-slate-400">(opcional)</span></label>
              <textarea id={`${formId}-reason`} className={inputClass} rows={3} maxLength={300} placeholder="Ej. Revisión y limpieza" value={reason} onChange={e => setReason(e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label htmlFor={`${formId}-notes`} className={labelClass}>Notas administrativas <span className="font-normal text-xs text-slate-400">(opcional)</span></label>
              <textarea id={`${formId}-notes`} className={inputClass} rows={3} maxLength={1000} placeholder="Indicaciones para recepción" value={notes} onChange={e => setNotes(e.target.value)} disabled={submitting} />
            </div>
          </section>
          {!isEditing && <p className="text-xs text-slate-500">La cita se registrará como programada.</p>}
        </form>
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-white" disabled={submitting}>Cancelar</button>
          <button type="submit" form={formId} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={submitting}>{submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar cita'}</button>
        </div>
      </div>
    </Modal>
  );
}
