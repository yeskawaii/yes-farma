import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, AlertCircle, RefreshCw, Calendar, Clock, CheckCircle } from 'lucide-react';
import { clinicalEncountersApi } from './api';
import type { ClinicalEncounterDetail } from './types';
import { ApiClientError } from '../../core/api/client';

const narrativeFields = [
  'reasonForVisit',
  'relevantHistory',
  'allergies',
  'currentMedications',
  'physicalExamination',
  'indications',
  'clinicalNotes'
] as const;

type NarrativeField = typeof narrativeFields[number];

type NarrativeState = Record<NarrativeField, string>;

type NarrativeChanges = Partial<Pick<ClinicalEncounterDetail, NarrativeField>>;

export function EncounterEditor() {
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<ClinicalEncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<NarrativeState>({
    reasonForVisit: '',
    relevantHistory: '',
    allergies: '',
    currentMedications: '',
    physicalExamination: '',
    indications: '',
    clinicalNotes: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; isConflict: boolean } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const fetchEncounter = useCallback(async () => {
    if (!encounterId) return;

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      setLoading(true);
      setError(null);
      const res = await clinicalEncountersApi.getClinicalEncounter(encounterId);
      if (currentRequestId === requestIdRef.current) {
        setData(res);
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        if (err instanceof ApiClientError && err.status === 403) {
          setError('No tienes permisos para ver el detalle de esta consulta.');
        } else {
          setError('Ocurrió un error al cargar la consulta.');
        }
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [encounterId]);

  useEffect(() => {
    void fetchEncounter();

    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchEncounter]);

  useEffect(() => {
    if (data) {
      setFormData({
        reasonForVisit: data.reasonForVisit ?? '',
        relevantHistory: data.relevantHistory ?? '',
        allergies: data.allergies ?? '',
        currentMedications: data.currentMedications ?? '',
        physicalExamination: data.physicalExamination ?? '',
        indications: data.indications ?? '',
        clinicalNotes: data.clinicalNotes ?? ''
      });
    }
  }, [data]);

  const normalizeValue = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  const getChanges = (): NarrativeChanges | null => {
    if (!data) return null;

    const changes: NarrativeChanges = {};

    for (const field of narrativeFields) {
      const original = normalizeValue(data[field]);
      const current = normalizeValue(formData[field]);

      if (original !== current) {
        changes[field] = current;
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  };

  const handleSave = async () => {
    const changes = getChanges();
    if (!changes || !data || !encounterId) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    // Invalidamos cualquier GET en vuelo para que un fetch lento no
    // sobrescriba nuestro PATCH exitoso
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      const payload = {
        version: data.version,
        ...changes
      };

      const updated = await clinicalEncountersApi.updateClinicalEncounter(encounterId, payload);

      if (currentRequestId === requestIdRef.current) {
        setData(updated);
        setSaveMessage('Borrador guardado');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        if (err instanceof ApiClientError && err.status === 409) {
          setSaveError({
            message: 'Esta consulta fue modificada en otro lugar. Recarga la información antes de continuar.',
            isConflict: true
          });
        } else {
          setSaveError({
            message: 'Ocurrió un error al guardar el borrador.',
            isConflict: false
          });
        }
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleReload = () => {
    setSaveError(null);
    void fetchEncounter();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleBack = () => {
    navigate(`/patients/${patientId}`);
  };

  if (error) {
    return (
      <div className="flex flex-col gap-6 animate-slide-up">
        <div>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium group text-sm"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Volver al paciente
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="text-red-500" size={40} />
          <div>
            <h3 className="text-red-800 font-bold text-lg">Error al cargar</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
          <button
            onClick={() => { void fetchEncounter(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium mt-2"
          >
            <RefreshCw size={18} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-24 h-6 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm h-40"></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm h-64"></div>
      </div>
    );
  }

  const renderReadonlyField = (label: string, value: string | null | undefined) => (
    <div className="mb-6 last:mb-0">
      <p className="text-sm font-semibold text-slate-700 mb-2">{label}</p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
        {value ? value : <span className="text-slate-400 italic">Sin registro</span>}
      </div>
    </div>
  );

  const renderEditableField = (label: string, field: keyof NarrativeState, maxLength: number) => (
    <div className="mb-6 last:mb-0">
      <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor={field}>
        {label}
      </label>
      <textarea
        id={field}
        value={formData[field]}
        onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
        maxLength={maxLength}
        disabled={isSaving}
        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y min-h-[120px] disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Top Bar */}
      <div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium group text-sm"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Volver al paciente
        </button>
      </div>

      {/* Header Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Consulta clínica</h1>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              <span>{formatDate(data.occurredAt)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span>{data.patient.displayName}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:items-end gap-2 shrink-0">
          {data.status === 'FINALIZED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle size={16} />
              Finalizada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <Clock size={16} />
              Borrador
            </span>
          )}
        </div>
      </div>

      {/* Info Card */}
      {data.status === 'DRAFT' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-blue-800 text-sm flex items-start gap-3 shadow-sm">
          <FileText className="shrink-0 mt-0.5" size={18} />
          <p>Esta consulta está en borrador. A continuación puedes capturar la información clínica.</p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-slate-700 text-sm flex items-start gap-3 shadow-sm">
          <CheckCircle className="shrink-0 mt-0.5 text-slate-500" size={18} />
          <p>Esta consulta está finalizada y es de solo lectura.</p>
        </div>
      )}

      {/* Basic Data Readonly */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Información general</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Paciente</p>
            <p className="text-slate-900 font-medium">{data.patient.displayName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Profesional responsable</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                {data.professional.displayName.charAt(0)}
              </div>
              <p className="text-slate-900 font-medium">{data.professional.displayName}</p>
            </div>
          </div>

          {data.appointment && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cita vinculada</p>
              <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
                <Calendar size={16} className="text-slate-400" />
                Consulta agendada
              </div>
            </div>
          )}
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            <p className="text-red-800 text-sm font-medium">{saveError.message}</p>
          </div>
          {saveError.isConflict && (
            <button
              onClick={handleReload}
              className="self-start inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors font-medium text-sm"
            >
              <RefreshCw size={18} />
              Recargar consulta
            </button>
          )}
        </div>
      )}

      {/* Clinical Data Forms */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Consulta</h2>
        {data.status === 'DRAFT' ? (
          <>
            {renderEditableField('Motivo de consulta', 'reasonForVisit', 5000)}
            {renderEditableField('Antecedentes relevantes', 'relevantHistory', 10000)}
            {renderEditableField('Alergias', 'allergies', 5000)}
            {renderEditableField('Medicamentos actuales', 'currentMedications', 5000)}
          </>
        ) : (
          <>
            {renderReadonlyField('Motivo de consulta', data.reasonForVisit)}
            {renderReadonlyField('Antecedentes relevantes', data.relevantHistory)}
            {renderReadonlyField('Alergias', data.allergies)}
            {renderReadonlyField('Medicamentos actuales', data.currentMedications)}
          </>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Evaluación y plan</h2>
        {data.status === 'DRAFT' ? (
          <>
            {renderEditableField('Exploración física', 'physicalExamination', 10000)}
            {renderEditableField('Indicaciones', 'indications', 10000)}
            {renderEditableField('Notas clínicas', 'clinicalNotes', 10000)}
          </>
        ) : (
          <>
            {renderReadonlyField('Exploración física', data.physicalExamination)}
            {renderReadonlyField('Indicaciones', data.indications)}
            {renderReadonlyField('Notas clínicas', data.clinicalNotes)}
          </>
        )}

        {data.status === 'DRAFT' && (
          <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={() => void handleSave()}
              disabled={!getChanges() || isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all font-medium text-sm"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Guardar borrador
                </>
              )}
            </button>
            {saveMessage && !isSaving && (
              <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2">
                <CheckCircle size={16} />
                {saveMessage}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
