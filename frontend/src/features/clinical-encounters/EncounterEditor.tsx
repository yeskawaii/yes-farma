import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, AlertCircle, RefreshCw, Calendar, Clock, CheckCircle } from 'lucide-react';
import { clinicalEncountersApi } from './api';
import type { ClinicalEncounterDetail, VitalSignsInput } from './types';
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

type DraftChanges = NarrativeChanges & {
  vitalSigns?: VitalSignsInput | null;
};

type VitalSignsState = {
  systolicBloodPressure: string;
  diastolicBloodPressure: string;
  heartRate: string;
  respiratoryRate: string;
  temperatureCelsius: string;
  oxygenSaturationPercent: string;
  weightKg: string;
  heightCm: string;
};

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

  const [vitalSignsForm, setVitalSignsForm] = useState<VitalSignsState>({
    systolicBloodPressure: '',
    diastolicBloodPressure: '',
    heartRate: '',
    respiratoryRate: '',
    temperatureCelsius: '',
    oxygenSaturationPercent: '',
    weightKg: '',
    heightCm: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
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
      setVitalSignsForm({
        systolicBloodPressure: data.vitalSigns?.systolicBloodPressure?.toString() ?? '',
        diastolicBloodPressure: data.vitalSigns?.diastolicBloodPressure?.toString() ?? '',
        heartRate: data.vitalSigns?.heartRate?.toString() ?? '',
        respiratoryRate: data.vitalSigns?.respiratoryRate?.toString() ?? '',
        temperatureCelsius: data.vitalSigns?.temperatureCelsius ?? '',
        oxygenSaturationPercent: data.vitalSigns?.oxygenSaturationPercent?.toString() ?? '',
        weightKg: data.vitalSigns?.weightKg ?? '',
        heightCm: data.vitalSigns?.heightCm?.toString() ?? ''
      });
    }
  }, [data]);

  const normalizeValue = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  const isSemanticallyEqual = (textValue: string, originalNumber: number | string | null | undefined): boolean => {
    const trimmed = textValue.trim();
    if (trimmed === '') {
      return originalNumber === null || originalNumber === undefined;
    }
    const parsedText = Number(trimmed);
    if (!Number.isFinite(parsedText)) {
      return false; // If text is "abc", it can't be equal to original number or null
    }
    const originalValue = originalNumber === null || originalNumber === undefined ? null : Number(originalNumber);
    return originalValue === parsedText;
  };

  const hasVitalSignsChanges = (): boolean => {
    if (!data) return false;
    const original = data.vitalSigns;
    if (!isSemanticallyEqual(vitalSignsForm.systolicBloodPressure, original?.systolicBloodPressure)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.diastolicBloodPressure, original?.diastolicBloodPressure)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.heartRate, original?.heartRate)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.respiratoryRate, original?.respiratoryRate)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.temperatureCelsius, original?.temperatureCelsius)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.oxygenSaturationPercent, original?.oxygenSaturationPercent)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.weightKg, original?.weightKg)) return true;
    if (!isSemanticallyEqual(vitalSignsForm.heightCm, original?.heightCm)) return true;
    return false;
  };

  const validateVitalSignsForm = (form: VitalSignsState): string | null => {
    const checkNumeric = (val: string, fieldName: string, min: number, max: number, isInt: boolean = false): string | null => {
      const trimmed = val.trim();
      if (trimmed === '') return null;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return `${fieldName} debe ser un número válido.`;
      if (isInt && !Number.isInteger(parsed)) return `${fieldName} no acepta decimales.`;
      if (parsed < min || parsed > max) return `${fieldName} debe estar entre ${min} y ${max}.`;
      return null;
    };

    let err = checkNumeric(form.systolicBloodPressure, 'La presión sistólica', 30, 300, true);
    if (err) return err;
    err = checkNumeric(form.diastolicBloodPressure, 'La presión diastólica', 20, 200, true);
    if (err) return err;

    const sysTrim = form.systolicBloodPressure.trim();
    const diaTrim = form.diastolicBloodPressure.trim();
    if (sysTrim !== '' && diaTrim !== '') {
      const sys = Number(sysTrim);
      const dia = Number(diaTrim);
      if (Number.isFinite(sys) && Number.isFinite(dia) && sys <= dia) {
        return 'La presión sistólica debe ser mayor que la diastólica.';
      }
    }

    err = checkNumeric(form.heartRate, 'La frecuencia cardiaca', 20, 300, true);
    if (err) return err;
    err = checkNumeric(form.respiratoryRate, 'La frecuencia respiratoria', 5, 80, true);
    if (err) return err;
    err = checkNumeric(form.temperatureCelsius, 'La temperatura', 25, 45, false);
    if (err) return err;
    err = checkNumeric(form.oxygenSaturationPercent, 'La saturación de oxígeno', 0, 100, true);
    if (err) return err;
    err = checkNumeric(form.weightKg, 'El peso', 0.5, 500, false);
    if (err) return err;
    err = checkNumeric(form.heightCm, 'La estatura', 20, 300, true);
    if (err) return err;

    return null;
  };

  const hasNarrativeChanges = (): boolean => {
    if (!data) return false;
    for (const field of narrativeFields) {
      if (normalizeValue(data[field]) !== normalizeValue(formData[field])) return true;
    }
    return false;
  };

  const hasAnyChanges = (): boolean => {
    return hasNarrativeChanges() || hasVitalSignsChanges();
  };

  const handleSave = async () => {
    if (!data || !encounterId || !hasAnyChanges()) return;

    if (hasVitalSignsChanges()) {
      const vErr = validateVitalSignsForm(vitalSignsForm);
      if (vErr) {
        setSaveError({ message: vErr, isConflict: false });
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    // Invalidamos cualquier GET en vuelo para que un fetch lento no
    // sobrescriba nuestro PATCH exitoso
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      const changes: DraftChanges = {};

      for (const field of narrativeFields) {
        const original = normalizeValue(data[field]);
        const current = normalizeValue(formData[field]);
        if (original !== current) {
          changes[field] = current;
        }
      }

      if (hasVitalSignsChanges()) {
        const constructNumber = (val: string) => val.trim() === '' ? null : Number(val.trim());

        const currentVitals: VitalSignsInput = {
          systolicBloodPressure: constructNumber(vitalSignsForm.systolicBloodPressure),
          diastolicBloodPressure: constructNumber(vitalSignsForm.diastolicBloodPressure),
          heartRate: constructNumber(vitalSignsForm.heartRate),
          respiratoryRate: constructNumber(vitalSignsForm.respiratoryRate),
          temperatureCelsius: constructNumber(vitalSignsForm.temperatureCelsius),
          oxygenSaturationPercent: constructNumber(vitalSignsForm.oxygenSaturationPercent),
          weightKg: constructNumber(vitalSignsForm.weightKg),
          heightCm: constructNumber(vitalSignsForm.heightCm)
        };

        const isAllNull = Object.values(currentVitals).every(val => val === null);
        changes.vitalSigns = isAllNull ? null : currentVitals;
      }

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

  const handleFinalize = async () => {
    if (!data || !encounterId) return;

    setIsFinalizing(true);
    setSaveError(null);
    setSaveMessage(null);

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      const updated = await clinicalEncountersApi.finalizeClinicalEncounter(encounterId, {
        version: data.version
      });

      if (currentRequestId === requestIdRef.current) {
        setData(updated);
        setShowFinalizeConfirm(false);
        setSaveMessage('Consulta finalizada');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        if (err instanceof ApiClientError && err.status === 409) {
          setSaveError({
            message: 'No fue posible finalizar porque la consulta cambió o ya fue finalizada en otro lugar. Recarga la información antes de continuar.',
            isConflict: true
          });
          setShowFinalizeConfirm(false);
        } else if (err instanceof ApiClientError && err.status === 403) {
          setSaveError({
            message: 'No tienes permisos para finalizar esta consulta.',
            isConflict: false
          });
          setShowFinalizeConfirm(false);
        } else {
          setSaveError({
            message: 'No fue posible finalizar la consulta. Intenta nuevamente.',
            isConflict: false
          });
          setShowFinalizeConfirm(false);
        }
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsFinalizing(false);
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

  const renderReadonlyVital = (label: string, value: number | string | null | undefined, unit: string) => (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      {value !== null && value !== undefined && value !== '' ? (
        <p className="text-slate-900 font-medium">{value} <span className="text-slate-500 text-sm ml-0.5">{unit}</span></p>
      ) : (
        <p className="text-slate-400 italic text-sm">Sin registro</p>
      )}
    </div>
  );

  const renderVitalInput = (
    label: string,
    field: keyof VitalSignsState,
    unit: string,
    min?: number,
    max?: number,
    step?: string
  ) => (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor={field}>
        {label}
      </label>
      <div className="relative">
        <input
          id={field}
          type="number"
          min={min}
          max={max}
          step={step}
          value={vitalSignsForm[field]}
          onChange={(e) => {
            setSaveError(null);
            setVitalSignsForm((prev) => ({ ...prev, [field]: e.target.value }));
          }}
          disabled={isSaving}
          className="w-full bg-white border border-slate-300 rounded-xl pl-4 pr-12 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <span className="text-slate-400 text-sm font-medium">{unit}</span>
        </div>
      </div>
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

          {data.status === 'FINALIZED' && data.finalizedAt && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Finalizada</p>
              <p className="text-slate-900 font-medium">{formatDate(data.finalizedAt)}</p>
            </div>
          )}

          {data.status === 'FINALIZED' && data.finalizedBy && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Finalizada por</p>
              <p className="text-slate-900 font-medium">{data.finalizedBy.displayName}</p>
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

      {/* Vitals Data Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Signos vitales</h2>
        {data.status === 'DRAFT' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {renderVitalInput('Presión sistólica', 'systolicBloodPressure', 'mmHg', 30, 300)}
            {renderVitalInput('Presión diastólica', 'diastolicBloodPressure', 'mmHg', 20, 200)}
            {renderVitalInput('Frecuencia cardiaca', 'heartRate', 'lpm', 20, 300)}
            {renderVitalInput('Frecuencia respiratoria', 'respiratoryRate', 'rpm', 5, 80)}
            {renderVitalInput('Temperatura', 'temperatureCelsius', '°C', 25, 45, '0.1')}
            {renderVitalInput('Saturación de oxígeno', 'oxygenSaturationPercent', '%', 0, 100)}
            {renderVitalInput('Peso', 'weightKg', 'kg', 0.5, 500, '0.1')}
            {renderVitalInput('Estatura', 'heightCm', 'cm', 20, 300)}
          </div>
        ) : (
          !data.vitalSigns ? (
            <p className="text-sm text-slate-500 italic">Sin signos vitales registrados</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-8">
              {renderReadonlyVital('Presión sistólica', data.vitalSigns.systolicBloodPressure, 'mmHg')}
              {renderReadonlyVital('Presión diastólica', data.vitalSigns.diastolicBloodPressure, 'mmHg')}
              {renderReadonlyVital('Frecuencia cardiaca', data.vitalSigns.heartRate, 'lpm')}
              {renderReadonlyVital('Frecuencia respiratoria', data.vitalSigns.respiratoryRate, 'rpm')}
              {renderReadonlyVital('Temperatura', data.vitalSigns.temperatureCelsius, '°C')}
              {renderReadonlyVital('Saturación de oxígeno', data.vitalSigns.oxygenSaturationPercent, '%')}
              {renderReadonlyVital('Peso', data.vitalSigns.weightKg, 'kg')}
              {renderReadonlyVital('Estatura', data.vitalSigns.heightCm, 'cm')}
            </div>
          )
        )}
      </div>

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
          <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => void handleSave()}
                disabled={!hasAnyChanges() || isSaving || isFinalizing}
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

              <button
                onClick={() => setShowFinalizeConfirm(true)}
                disabled={isSaving || isFinalizing || hasAnyChanges()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all font-medium text-sm"
              >
                Finalizar consulta
              </button>

              {saveMessage && !isSaving && !isFinalizing && (
                <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2">
                  <CheckCircle size={16} />
                  {saveMessage}
                </span>
              )}
            </div>

            {hasAnyChanges() && (
              <p className="text-sm text-amber-700 bg-amber-50 px-4 py-2 rounded-lg inline-flex self-start border border-amber-200">
                Guarda los cambios pendientes antes de finalizar la consulta.
              </p>
            )}
          </div>
        )}
      </div>

      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Finalizar consulta</h3>
              <p className="text-slate-600 text-sm">
                Al finalizar la consulta, el registro clínico quedará en modo de solo lectura. Las correcciones posteriores deberán realizarse mediante una enmienda.
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={isFinalizing}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleFinalize()}
                disabled={isFinalizing}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {isFinalizing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Finalizando...
                  </>
                ) : (
                  'Finalizar consulta'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
