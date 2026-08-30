import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  PlusCircle,
  Layers,
  History,
  CheckCircle2,
  Clock,
  Ban,
  Calendar,
  User,
  CheckCircle,
  Info,
  RefreshCw
} from 'lucide-react';
import { odontogramApi } from '../api';
import { ApiClientError } from '../../../core/api/client';
import type {
  DentalFindingType,
  ToothSurface,
  ToothDetailResponse,
  DentalFindingItem
} from '../types';

interface ToothDetailModalProps {
  patientId: string;
  toothNumber: number | null;
  onClose: () => void;
  onFindingUpdated: () => void;
}

const FINDING_TYPE_LABELS: Record<DentalFindingType, string> = {
  CARIES: 'Caries Dental',
  RESTORATION: 'Restauración / Obturación',
  CROWN: 'Corona Protésica',
  ENDODONTIC_TREATMENT: 'Tratamiento de Conductos (Endodoncia)',
  IMPLANT: 'Implante Dental',
  MISSING: 'Pieza Ausente',
  FRACTURE: 'Fractura / Fisura Dental',
  EXTRACTION_INDICATED: 'Extracción Indicada',
  PROSTHESIS: 'Póntico / Prótesis',
  OTHER: 'Otro Hallazgo'
};

const WHOLE_TOOTH_ONLY_TYPES: DentalFindingType[] = [
  'CROWN',
  'ENDODONTIC_TREATMENT',
  'IMPLANT',
  'MISSING',
  'EXTRACTION_INDICATED',
  'PROSTHESIS'
];

export const ToothDetailModal: React.FC<ToothDetailModalProps> = ({
  patientId,
  toothNumber,
  onClose,
  onFindingUpdated
}) => {
  const [data, setData] = useState<ToothDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ADD' | 'HISTORY'>('ACTIVE');

  // New Finding Form State
  const [newType, setNewType] = useState<DentalFindingType>('CARIES');
  const [newSurfaces, setNewSurfaces] = useState<ToothSurface[]>(['OCCLUSAL']);
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inline Action States
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const isAnterior =
    toothNumber !== null &&
    [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43].includes(toothNumber);

  const isWholeToothOnlyType = WHOLE_TOOTH_ONLY_TYPES.includes(newType);

  const loadToothDetail = useCallback(async () => {
    if (toothNumber === null) return;
    try {
      setLoading(true);
      setError(null);
      const res = await odontogramApi.getToothDetail(patientId, toothNumber);
      setData(res);
      if (res.activeFindings.length === 0) {
        setActiveTab('ADD');
      } else {
        setActiveTab('ACTIVE');
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cargar la información del diente');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, toothNumber]);

  useEffect(() => {
    if (toothNumber === null) return;

    // Reset clean state on tooth change
    setResolvingId(null);
    setCancellingId(null);
    setResolutionNotes('');
    setCancellationReason('');
    setActionError(null);
    setSubmitError(null);
    setNewNotes('');

    // Reset surface default according to anterior/posterior
    if (isAnterior) {
      setNewSurfaces(['INCISAL']);
    } else {
      setNewSurfaces(['OCCLUSAL']);
    }
    setNewType('CARIES');

    loadToothDetail();
  }, [patientId, toothNumber, isAnterior, loadToothDetail]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !actionSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting, actionSubmitting]);

  const handleTypeChange = (type: DentalFindingType) => {
    setNewType(type);
    setSubmitError(null);

    if (WHOLE_TOOTH_ONLY_TYPES.includes(type)) {
      setNewSurfaces(['WHOLE_TOOTH']);
    } else {
      // Surface-oriented default
      if (newSurfaces.includes('WHOLE_TOOTH') || newSurfaces.length === 0) {
        setNewSurfaces([isAnterior ? 'INCISAL' : 'OCCLUSAL']);
      }
    }
  };

  const handleToggleSurface = (surface: ToothSurface) => {
    if (isWholeToothOnlyType) return;

    if (surface === 'WHOLE_TOOTH') {
      setNewSurfaces(['WHOLE_TOOTH']);
      return;
    }

    let updated = newSurfaces.filter((s) => s !== 'WHOLE_TOOTH');
    if (updated.includes(surface)) {
      updated = updated.filter((s) => s !== surface);
    } else {
      updated.push(surface);
    }

    if (updated.length === 0) {
      updated = [surface];
    }

    setNewSurfaces(updated);
  };

  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (toothNumber === null) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      await odontogramApi.createFinding(patientId, {
        toothNumber,
        findingType: newType,
        surfaces: isWholeToothOnlyType ? ['WHOLE_TOOTH'] : newSurfaces,
        notes: newNotes.trim() ? newNotes.trim() : null
      });

      setNewNotes('');
      onFindingUpdated();
      await loadToothDetail();
      setActiveTab('ACTIVE');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Error al registrar el hallazgo');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartResolve = (finding: DentalFindingItem) => {
    setResolvingId(finding.id);
    setCancellingId(null);
    setResolutionNotes('');
    setActionError(null);
  };

  const handleStartCancel = (finding: DentalFindingItem) => {
    setCancellingId(finding.id);
    setResolvingId(null);
    setCancellationReason('');
    setActionError(null);
  };

  const handleResolveFinding = async (finding: DentalFindingItem) => {
    try {
      setActionSubmitting(true);
      setActionError(null);

      await odontogramApi.resolveFinding(patientId, finding.id, {
        expectedVersion: finding.version,
        resolutionNotes: resolutionNotes.trim() ? resolutionNotes.trim() : null
      });

      setResolvingId(null);
      setResolutionNotes('');
      onFindingUpdated();
      await loadToothDetail();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'STALE_VERSION') {
        await loadToothDetail();
        onFindingUpdated();
        setActionError(
          'El hallazgo fue modificado por otro usuario en otra sesión. La información se ha actualizado automáticamente. Por favor revisa el estado actual.'
        );
      } else if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al resolver el hallazgo');
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleCancelFinding = async (finding: DentalFindingItem) => {
    if (!cancellationReason.trim()) {
      setActionError('El motivo de cancelación es obligatorio.');
      return;
    }

    try {
      setActionSubmitting(true);
      setActionError(null);

      await odontogramApi.cancelFinding(patientId, finding.id, {
        expectedVersion: finding.version,
        cancellationReason: cancellationReason.trim()
      });

      setCancellingId(null);
      setCancellationReason('');
      onFindingUpdated();
      await loadToothDetail();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'STALE_VERSION') {
        await loadToothDetail();
        onFindingUpdated();
        setActionError(
          'El hallazgo fue modificado por otro usuario en otra sesión. La información se ha actualizado automáticamente. Por favor revisa el estado actual.'
        );
      } else if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al cancelar el hallazgo');
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
  };

  if (toothNumber === null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tooth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white font-black text-sm">
                FDI {toothNumber}
              </span>
              <h2 id="tooth-modal-title" className="text-lg font-bold text-slate-900">
                {data?.toothName || `Pieza ${toothNumber}`}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestión clínica longitudinal de la pieza dental permanente
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div role="tablist" aria-label="Pestañas de la pieza dental" className="flex border-b border-slate-200 px-6 bg-white gap-2 overflow-x-auto">
          <button
            role="tab"
            aria-selected={activeTab === 'ACTIVE'}
            aria-controls="tab-active-findings"
            id="tab-btn-active"
            onClick={() => setActiveTab('ACTIVE')}
            className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 shrink-0 transition-colors ${
              activeTab === 'ACTIVE'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={16} />
            Hallazgos Activos
            {data && data.activeFindings.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-xs bg-blue-100 text-blue-800 rounded-full font-bold">
                {data.activeFindings.length}
              </span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'ADD'}
            aria-controls="tab-add-finding"
            id="tab-btn-add"
            onClick={() => setActiveTab('ADD')}
            className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 shrink-0 transition-colors ${
              activeTab === 'ADD'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PlusCircle size={16} />
            Registrar Hallazgo
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'HISTORY'}
            aria-controls="tab-history"
            id="tab-btn-history"
            onClick={() => setActiveTab('HISTORY')}
            className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 shrink-0 transition-colors ${
              activeTab === 'HISTORY'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History size={16} />
            Historial ({ (data?.history.length || 0) + (data?.assessments?.length || 0) })
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && !data && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw size={24} className="text-blue-500 animate-spin" />
              <p className="text-xs font-semibold text-slate-500">Cargando información clínica...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium mb-4">
              {error}
            </div>
          )}

          {actionError && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium mb-4 flex items-start gap-2">
              <Info size={16} className="shrink-0 text-amber-600 mt-0.5" />
              <p>{actionError}</p>
            </div>
          )}

          {data && (
            <>
              {/* TAB 1: ACTIVE FINDINGS */}
              {activeTab === 'ACTIVE' && (
                <div
                  id="tab-active-findings"
                  role="tabpanel"
                  aria-labelledby="tab-btn-active"
                  className="space-y-4"
                >
                  {data.activeFindings.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <p className="text-sm font-medium text-slate-600 mb-2">
                        Esta pieza no tiene hallazgos clínicos activos.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('ADD')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
                      >
                        <PlusCircle size={14} />
                        Agregar Hallazgo
                      </button>
                    </div>
                  ) : (
                    data.activeFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="p-4 border border-slate-200 rounded-2xl bg-white shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">
                                {FINDING_TYPE_LABELS[finding.findingType]}
                              </span>
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                                Activo
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {finding.surfaces.map((s) => (
                                <span
                                  key={s}
                                  className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100"
                                >
                                  {s === 'WHOLE_TOOTH' ? 'Pieza Completa' : s}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {finding.notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                            {finding.notes}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>Registrado el {formatDate(finding.createdAt)}</span>
                          </div>
                          <span>Por: {finding.createdBy.name}</span>
                        </div>

                        {/* Inline Actions */}
                        {resolvingId === finding.id ? (
                          <div className="mt-3 p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3 animate-in fade-in duration-100">
                            <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                              <CheckCircle size={14} className="text-emerald-600" />
                              Marcar hallazgo como resuelto
                            </h4>
                            <textarea
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              placeholder="Notas de resolución clínica (opcional, ej. 'Obturación con resina colocada')..."
                              maxLength={2000}
                              rows={2}
                              className="w-full text-xs p-2.5 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setResolvingId(null)}
                                disabled={actionSubmitting}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveFinding(finding)}
                                disabled={actionSubmitting}
                                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-2xs"
                              >
                                {actionSubmitting ? 'Guardando...' : 'Confirmar Resolución'}
                              </button>
                            </div>
                          </div>
                        ) : cancellingId === finding.id ? (
                          <div className="mt-3 p-3.5 bg-red-50/60 border border-red-200 rounded-xl space-y-3 animate-in fade-in duration-100">
                            <h4 className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                              <Ban size={14} className="text-red-600" />
                              Cancelar Hallazgo (Descartar)
                            </h4>
                            <textarea
                              value={cancellationReason}
                              onChange={(e) => setCancellationReason(e.target.value)}
                              placeholder="Motivo de cancelación obligatorio (ej. 'Registrado por error en pieza incorrecta')..."
                              maxLength={500}
                              rows={2}
                              className="w-full text-xs p-2.5 bg-white border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setCancellingId(null)}
                                disabled={actionSubmitting}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                              >
                                Volver
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelFinding(finding)}
                                disabled={actionSubmitting || !cancellationReason.trim()}
                                className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 shadow-2xs"
                              >
                                {actionSubmitting ? 'Cancelando...' : 'Confirmar Cancelación'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleStartCancel(finding)}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartResolve(finding)}
                              className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              Marcar como resuelto
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: REGISTER NEW FINDING */}
              {activeTab === 'ADD' && (
                <form
                  id="tab-add-finding"
                  role="tabpanel"
                  aria-labelledby="tab-btn-add"
                  onSubmit={handleCreateFinding}
                  className="space-y-5"
                >
                  {submitError && (
                    <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                      {submitError}
                    </div>
                  )}

                  {/* Finding Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Tipo de Hallazgo Dental
                    </label>
                    <select
                      value={newType}
                      onChange={(e) => handleTypeChange(e.target.value as DentalFindingType)}
                      className="w-full text-sm p-3 bg-white border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="CARIES">Caries Dental</option>
                      <option value="RESTORATION">Restauración / Obturación previa</option>
                      <option value="CROWN">Corona Protésica (Pieza Completa)</option>
                      <option value="ENDODONTIC_TREATMENT">Tratamiento de Conductos (Pieza Completa)</option>
                      <option value="IMPLANT">Implante Dental (Pieza Completa)</option>
                      <option value="MISSING">Pieza Ausente (Pieza Completa)</option>
                      <option value="FRACTURE">Fractura / Fisura Dental</option>
                      <option value="EXTRACTION_INDICATED">Extracción Indicada (Pieza Completa)</option>
                      <option value="PROSTHESIS">Póntico / Prótesis (Pieza Completa)</option>
                      <option value="OTHER">Otro Hallazgo</option>
                    </select>
                  </div>

                  {/* Surfaces Multi-select */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Superficies Afectadas
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {isWholeToothOnlyType
                          ? 'Regla: Aplica a pieza completa'
                          : isAnterior
                          ? 'Pieza anterior (Incisal)'
                          : 'Pieza posterior (Oclusal)'}
                      </span>
                    </div>

                    {isWholeToothOnlyType ? (
                      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 text-xs text-blue-800 font-medium">
                        <Info size={16} className="text-blue-600 shrink-0" />
                        <span>
                          Los hallazgos de tipo <strong>{FINDING_TYPE_LABELS[newType]}</strong> se aplican obligatoriamente a la pieza completa (WHOLE_TOOTH).
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {/* WHOLE_TOOTH */}
                        <button
                          type="button"
                          onClick={() => handleToggleSurface('WHOLE_TOOTH')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            newSurfaces.includes('WHOLE_TOOTH')
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Pieza Completa
                          {newSurfaces.includes('WHOLE_TOOTH') && <CheckCircle2 size={14} />}
                        </button>

                        {/* VESTIBULAR */}
                        <button
                          type="button"
                          onClick={() => handleToggleSurface('VESTIBULAR')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            newSurfaces.includes('VESTIBULAR')
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Vestibular (V)
                          {newSurfaces.includes('VESTIBULAR') && <CheckCircle2 size={14} />}
                        </button>

                        {/* LINGUAL_PALATAL */}
                        <button
                          type="button"
                          onClick={() => handleToggleSurface('LINGUAL_PALATAL')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            newSurfaces.includes('LINGUAL_PALATAL')
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Lingual / Palatino (L/P)
                          {newSurfaces.includes('LINGUAL_PALATAL') && <CheckCircle2 size={14} />}
                        </button>

                        {/* MESIAL */}
                        <button
                          type="button"
                          onClick={() => handleToggleSurface('MESIAL')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            newSurfaces.includes('MESIAL')
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Mesial (M)
                          {newSurfaces.includes('MESIAL') && <CheckCircle2 size={14} />}
                        </button>

                        {/* DISTAL */}
                        <button
                          type="button"
                          onClick={() => handleToggleSurface('DISTAL')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            newSurfaces.includes('DISTAL')
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Distal (D)
                          {newSurfaces.includes('DISTAL') && <CheckCircle2 size={14} />}
                        </button>

                        {/* OCCLUSAL or INCISAL */}
                        {isAnterior ? (
                          <button
                            type="button"
                            onClick={() => handleToggleSurface('INCISAL')}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                              newSurfaces.includes('INCISAL')
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Incisal (I)
                            {newSurfaces.includes('INCISAL') && <CheckCircle2 size={14} />}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleSurface('OCCLUSAL')}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                              newSurfaces.includes('OCCLUSAL')
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Oclusal (O)
                            {newSurfaces.includes('OCCLUSAL') && <CheckCircle2 size={14} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Notas Clínicas (Opcional)
                    </label>
                    <textarea
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Observaciones clínicas específicas sobre el hallazgo..."
                      maxLength={2000}
                      rows={3}
                      className="w-full text-sm p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Form Actions */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('ACTIVE')}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || newSurfaces.length === 0}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-2xs"
                    >
                      {submitting ? 'Registrando...' : 'Registrar Hallazgo'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: HISTORY */}
              {activeTab === 'HISTORY' && (
                <div
                  id="tab-history"
                  role="tabpanel"
                  aria-labelledby="tab-btn-history"
                  className="space-y-4"
                >
                  {(() => {
                    const combinedTimeline = [
                      ...(data.assessments || []).map((assess) => ({
                        kind: 'ASSESSMENT' as const,
                        id: `assess-${assess.id}`,
                        timestamp: new Date(assess.assessedAt || assess.createdAt).getTime(),
                        dateStr: assess.assessedAt || assess.createdAt,
                        assessment: assess
                      })),
                      ...(data.history || []).map((finding) => ({
                        kind: 'FINDING' as const,
                        id: `finding-${finding.id}`,
                        timestamp: new Date(finding.createdAt).getTime(),
                        dateStr: finding.createdAt,
                        finding: finding
                      }))
                    ].sort((a, b) => b.timestamp - a.timestamp);

                    if (combinedTimeline.length === 0) {
                      return (
                        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-500 text-sm font-medium">
                          No hay registros históricos para esta pieza.
                        </div>
                      );
                    }

                    return (
                      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {combinedTimeline.map((item) => {
                          if (item.kind === 'ASSESSMENT') {
                            const assess = item.assessment;
                            return (
                              <div key={item.id} className="relative space-y-2">
                                <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-emerald-500 border-emerald-500" />
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                    <CheckCircle2 size={16} className="text-emerald-600" />
                                    Valoración Clínica: Pieza Sana
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Sana
                                  </span>
                                </div>

                                {assess.notes && (
                                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                    {assess.notes}
                                  </p>
                                )}

                                <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                                  <span className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    Evaluada: {formatDate(assess.assessedAt)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <User size={12} />
                                    Por: {assess.assessedBy.name}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          const finding = item.finding;
                          return (
                            <div key={item.id} className="relative space-y-2">
                              <div
                                className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white ${
                                  finding.status === 'ACTIVE'
                                    ? 'border-blue-500 bg-blue-500'
                                    : finding.status === 'RESOLVED'
                                    ? 'border-emerald-500 bg-emerald-500'
                                    : 'border-slate-400 bg-slate-400'
                                }`}
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {FINDING_TYPE_LABELS[finding.findingType]}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    finding.status === 'ACTIVE'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : finding.status === 'RESOLVED'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {finding.status === 'ACTIVE'
                                    ? 'Activo'
                                    : finding.status === 'RESOLVED'
                                    ? 'Resuelto'
                                    : 'Cancelado'}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {finding.surfaces.map((s) => (
                                  <span
                                    key={s}
                                    className="text-[10px] font-medium px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded"
                                  >
                                    {s === 'WHOLE_TOOTH' ? 'Pieza Completa' : s}
                                  </span>
                                ))}
                              </div>

                              {finding.notes && (
                                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                  {finding.notes}
                                </p>
                              )}

                              {finding.status === 'RESOLVED' && (
                                <div className="text-xs text-emerald-800 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 space-y-1">
                                  <div className="flex items-center justify-between font-semibold">
                                    <span>Resolución Clínica:</span>
                                    {finding.resolvedAt && <span>{formatDate(finding.resolvedAt)}</span>}
                                  </div>
                                  {finding.resolutionNotes && <p>{finding.resolutionNotes}</p>}
                                  {finding.resolvedBy && (
                                    <p className="text-[10px] text-emerald-600">
                                      Resuelto por: {finding.resolvedBy.name}
                                    </p>
                                  )}
                                </div>
                              )}

                              {finding.status === 'CANCELLED' && (
                                <div className="text-xs text-slate-700 bg-slate-100 p-2.5 rounded-xl border border-slate-200 space-y-1">
                                  <div className="flex items-center justify-between font-semibold">
                                    <span>Cancelación / Descarte:</span>
                                    {finding.cancelledAt && <span>{formatDate(finding.cancelledAt)}</span>}
                                  </div>
                                  {finding.cancellationReason && <p>{finding.cancellationReason}</p>}
                                  {finding.cancelledBy && (
                                    <p className="text-[10px] text-slate-500">
                                      Cancelado por: {finding.cancelledBy.name}
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  Registrado: {formatDate(finding.createdAt)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User size={12} />
                                  Por: {finding.createdBy.name}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
