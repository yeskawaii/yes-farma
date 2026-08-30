import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Layers,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  Zap,
  CheckCircle,
  CheckSquare,
  Square
} from 'lucide-react';
import { odontogramApi } from '../api';
import { ApiClientError } from '../../../core/api/client';
import type {
  OdontogramResponse,
  DentalFindingType,
  ToothSurface,
  BatchValidationFailure,
  BatchOdontogramActionInput
} from '../types';
import { ToothGraphic } from './ToothGraphic';
import { ToothDetailModal } from './ToothDetailModal';
import { FastCaptureDock } from './FastCaptureDock';
import { MobileQuadrantView } from './MobileQuadrantView';

interface OdontogramViewProps {
  patientId: string;
}

const QUADRANT_1 = [18, 17, 16, 15, 14, 13, 12, 11];
const QUADRANT_2 = [21, 22, 23, 24, 25, 26, 27, 28];
const QUADRANT_4 = [48, 47, 46, 45, 44, 43, 42, 41];
const QUADRANT_3 = [31, 32, 33, 34, 35, 36, 37, 38];

const ANTERIOR_TEETH = [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43];

const WHOLE_TOOTH_ONLY_TYPES: DentalFindingType[] = [
  'CROWN',
  'ENDODONTIC_TREATMENT',
  'IMPLANT',
  'MISSING',
  'EXTRACTION_INDICATED',
  'PROSTHESIS'
];

function isAnteriorTooth(toothNumber: number): boolean {
  return ANTERIOR_TEETH.includes(toothNumber);
}

function generateSecureUuid(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant RFC 4122
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  throw new Error('El navegador no dispone de Web Crypto API segura para generar identificadores de operación.');
}

export const OdontogramView: React.FC<OdontogramViewProps> = ({ patientId }) => {
  const [data, setData] = useState<OdontogramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

  // Fast Capture Mode States
  const [isFastCaptureActive, setIsFastCaptureActive] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState<Set<number>>(new Set());
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [batchFailures, setBatchFailures] = useState<BatchValidationFailure[]>([]);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);
  const [resetDockTrigger, setResetDockTrigger] = useState(0);

  // Semantic Idempotency RequestId reference
  const requestIdRef = useRef<string | null>(null);
  const isRequestIdDirtyRef = useRef<boolean>(true);

  const getOrGenerateRequestId = (): string => {
    if (isRequestIdDirtyRef.current || !requestIdRef.current) {
      requestIdRef.current = generateSecureUuid();
      isRequestIdDirtyRef.current = false;
    }
    return requestIdRef.current;
  };

  const invalidateRequestId = () => {
    isRequestIdDirtyRef.current = true;
  };

  const loadOdontogram = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await odontogramApi.getOdontogram(patientId);
      setData(res);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cargar el odontograma del paciente.');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadOdontogram();
  }, [loadOdontogram]);

  const handleToggleFastCapture = () => {
    if (isFastCaptureActive) {
      // Exiting fast capture mode
      if (selectedTeeth.size > 0) {
        const confirmExit = window.confirm('Tienes piezas seleccionadas en Captura rápida. ¿Deseas salir y descartar la selección?');
        if (!confirmExit) return;
      }
      setSelectedTeeth(new Set());
      setBatchFailures([]);
      setBatchSuccessMessage(null);
      invalidateRequestId();
      setIsFastCaptureActive(false);
    } else {
      // Entering fast capture mode
      setSelectedTooth(null);
      setSelectedTeeth(new Set());
      setBatchFailures([]);
      setBatchSuccessMessage(null);
      invalidateRequestId();
      setResetDockTrigger((prev) => prev + 1);
      setIsFastCaptureActive(true);
    }
  };

  const handleToggleToothSelection = (toothNumber: number) => {
    invalidateRequestId();
    setSelectedTeeth((prev) => {
      const next = new Set(prev);
      if (next.has(toothNumber)) {
        next.delete(toothNumber);
      } else {
        next.add(toothNumber);
      }
      return next;
    });

    // If this tooth had a failure, remove it from the failures list
    if (batchFailures.some((f) => f.toothNumber === toothNumber)) {
      setBatchFailures((prev) => prev.filter((f) => f.toothNumber !== toothNumber));
    }
  };

  const handleToggleQuadrant = (quadrantTeeth: number[]) => {
    invalidateRequestId();
    setSelectedTeeth((prev) => {
      const next = new Set(prev);
      const isAllSelected = quadrantTeeth.every((t) => next.has(t));

      if (isAllSelected) {
        quadrantTeeth.forEach((t) => next.delete(t));
      } else {
        quadrantTeeth.forEach((t) => next.add(t));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedTeeth(new Set());
    setBatchFailures([]);
    setBatchSuccessMessage(null);
    invalidateRequestId();
    setResetDockTrigger((prev) => prev + 1);
  };

  const handleRemoveConflictedTeeth = (toothNumbers: number[]) => {
    setSelectedTeeth((prev) => {
      const next = new Set(prev);
      toothNumbers.forEach((t) => next.delete(t));
      return next;
    });
    setBatchFailures([]);
    invalidateRequestId();
  };

  const handleSubmitBatch = async (params: {
    actionType: 'HEALTHY' | DentalFindingType;
    surfaces: {
      hasOI: boolean;
      surfaces: ToothSurface[];
    };
    notes?: string | null;
  }) => {
    if (selectedTeeth.size === 0) return;

    try {
      setSubmittingBatch(true);
      setError(null);
      setBatchFailures([]);
      setBatchSuccessMessage(null);

      const toothNumbers = Array.from(selectedTeeth);
      const requestId = getOrGenerateRequestId();

      let payload: BatchOdontogramActionInput;

      if (params.actionType === 'HEALTHY') {
        payload = {
          requestId,
          action: 'RECORD_ASSESSMENT',
          assessmentType: 'HEALTHY',
          notes: params.notes || null,
          items: toothNumbers.map((toothNumber) => ({ toothNumber }))
        };
      } else {
        const findingType = params.actionType;
        payload = {
          requestId,
          action: 'CREATE_FINDING',
          findingType,
          notes: params.notes || null,
          items: toothNumbers.map((toothNumber) => {
            let itemSurfaces: ToothSurface[] = [];

            if (WHOLE_TOOTH_ONLY_TYPES.includes(findingType)) {
              // Automatic WHOLE_TOOTH for whole-tooth only types
              itemSurfaces = ['WHOLE_TOOTH'];
            } else {
              // Surface-oriented types: CARIES, RESTORATION, FRACTURE, OTHER
              if (params.surfaces.surfaces.includes('WHOLE_TOOTH')) {
                itemSurfaces = ['WHOLE_TOOTH'];
              } else {
                if (params.surfaces.hasOI) {
                  itemSurfaces.push(isAnteriorTooth(toothNumber) ? 'INCISAL' : 'OCCLUSAL');
                }
                for (const s of params.surfaces.surfaces) {
                  if (s !== 'INCISAL' && s !== 'OCCLUSAL' && s !== 'WHOLE_TOOTH') {
                    itemSurfaces.push(s);
                  }
                }
              }
            }

            return {
              toothNumber,
              surfaces: itemSurfaces
            };
          })
        };
      }

      await odontogramApi.applyBatch(patientId, payload);

      // Successful batch application
      setBatchSuccessMessage(
        params.actionType === 'HEALTHY'
          ? `Se registraron ${toothNumbers.length} piezas como sanas correctamente.`
          : `Se registró hallazgo (${params.actionType}) en ${toothNumbers.length} piezas correctamente.`
      );

      // Clean up for next operation
      setSelectedTeeth(new Set());
      setBatchFailures([]);
      invalidateRequestId();
      setResetDockTrigger((prev) => prev + 1);

      // Refresh odontogram view once
      await loadOdontogram();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'BATCH_VALIDATION_FAILED' && err.details) {
          const failures = (err.details as any)?.failures as BatchValidationFailure[] | undefined;
          if (failures && Array.isArray(failures)) {
            setBatchFailures(failures);
            setError('Uno o más elementos del lote tienen conflictos clínicos. Revisa las piezas marcadas.');
            return;
          }
        } else if (err.code === 'IDEMPOTENCY_KEY_REUSED') {
          invalidateRequestId();
          setError('La operación cambió y debe enviarse nuevamente. Por favor vuelve a pulsar Aplicar.');
          return;
        }

        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al procesar la operación en lote');
      }
    } finally {
      setSubmittingBatch(false);
    }
  };

  const failureMap = new Map<number, string>();
  for (const f of batchFailures) {
    failureMap.set(f.toothNumber, f.reasonMessage);
  }

  // Initial loading state when no data exists yet
  if (loading && data === null) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="h-6 bg-slate-200 rounded w-1/3" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
            <div className="h-16 bg-slate-100 rounded-xl" />
            <div className="h-16 bg-slate-100 rounded-xl" />
            <div className="h-16 bg-slate-100 rounded-xl" />
            <div className="h-16 bg-slate-100 rounded-xl" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center gap-4 min-h-[300px]">
          <RefreshCw size={28} className="text-blue-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Cargando odontograma permanente...</p>
        </div>
      </div>
    );
  }

  // Initial error state when no data exists yet
  if (error && data === null) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 animate-in fade-in duration-150">
        <AlertCircle className="text-red-500" size={36} />
        <div>
          <h3 className="text-red-800 font-bold text-base">Error al cargar el odontograma</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
        <button
          onClick={loadOdontogram}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors font-semibold text-sm"
        >
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6 animate-in fade-in duration-150 ${isFastCaptureActive ? 'pb-48 md:pb-56' : ''}`}>
      {/* Header & KPI Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Activity className="text-blue-600" size={22} />
              Odontograma Permanente (FDI)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registro dental longitudinal interactivo de 32 piezas permanentes.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Fast Capture Mode Activation Button */}
            <button
              type="button"
              onClick={handleToggleFastCapture}
              aria-pressed={isFastCaptureActive}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                isFastCaptureActive
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-500/50 shadow-md'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <Zap size={15} className={isFastCaptureActive ? 'fill-white' : 'text-indigo-600'} />
              Captura rápida
            </button>

            <button
              onClick={loadOdontogram}
              disabled={loading || submittingBatch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Fast Capture Mode Indicator Banner */}
        {isFastCaptureActive && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-indigo-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-indigo-600 shrink-0 fill-indigo-600" />
              <span>
                <span className="font-extrabold">Modo Captura Rápida Activo:</span> Toca las piezas para seleccionarlas en lote y aplicar acciones clínicas táctiles abajo.
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleFastCapture}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline shrink-0 cursor-pointer"
            >
              Desactivar
            </button>
          </div>
        )}

        {/* Success Alert Banner */}
        {batchSuccessMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2 text-xs text-emerald-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <span className="font-semibold">{batchSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setBatchSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold px-2 py-0.5"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Summary KPI Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                {data.summary.totalActiveFindings}
              </div>
              <div>
                <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
                  Hallazgos Activos
                </p>
                <p className="text-xs text-blue-700 font-medium">
                  En toda la dentición
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                {data.summary.teethWithActiveFindings}
              </div>
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                  Con Hallazgos
                </p>
                <p className="text-xs text-indigo-700 font-medium">
                  De 32 permanentes
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                {data.summary.healthyTeethCount || 0}
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                  Piezas Sanas
                </p>
                <p className="text-xs text-emerald-700 font-medium">
                  Evaluadas como sanas
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                {data.summary.missingTeethCount}
              </div>
              <div>
                <p className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                  Ausentes
                </p>
                <p className="text-xs text-rose-700 font-medium">
                  Registradas como ausentes
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && data !== null && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* MOBILE QUADRANT VIEW (Visible on small screens when Fast Capture is active) */}
      {isFastCaptureActive && (
        <div className="block md:hidden bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <MobileQuadrantView
            data={data}
            selectedTeeth={selectedTeeth}
            onToggleTooth={handleToggleToothSelection}
            onToggleQuadrant={handleToggleQuadrant}
            failures={batchFailures}
          />
        </div>
      )}

      {/* FULL FDI CHART (Always visible on tablet/desktop, and on mobile when Fast Capture is inactive) */}
      <div
        className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-x-auto ${
          isFastCaptureActive ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="min-w-[940px] flex flex-col gap-8">
          {/* UPPER ARCH (MAXILLA) */}
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-blue-500" />
                Arcada Superior (Maxilar)
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                Línea media central
              </span>
            </div>

            <div className="flex items-center justify-center gap-3">
              {/* Quadrant 1 (18 -> 11) */}
              <div className="flex flex-col items-end">
                <div className="flex items-center justify-between w-full mb-1.5 pr-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    Cuadrante 1 (Sup. Der.)
                  </span>
                  {isFastCaptureActive && (
                    <button
                      type="button"
                      onClick={() => handleToggleQuadrant(QUADRANT_1)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      {QUADRANT_1.every((t) => selectedTeeth.has(t)) ? (
                        <>
                          <Square size={11} />
                          Deseleccionar Q1
                        </>
                      ) : (
                        <>
                          <CheckSquare size={11} />
                          Seleccionar Q1
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_1.map((num) => {
                    const isHealthy = Boolean(data?.teeth[num]?.currentlyHealthy);
                    const isSelected = isFastCaptureActive ? selectedTeeth.has(num) : selectedTooth === num;
                    const isConflicted = failureMap.has(num);
                    const conflictMsg = failureMap.get(num);

                    return (
                      <ToothGraphic
                        key={num}
                        toothNumber={num}
                        activeFindings={data?.teeth[num]?.activeFindings || []}
                        currentlyHealthy={isHealthy}
                        isSelected={isSelected}
                        isFastCaptureActive={isFastCaptureActive}
                        isConflicted={isConflicted}
                        conflictMessage={conflictMsg}
                        onClick={() => {
                          if (isFastCaptureActive) {
                            handleToggleToothSelection(num);
                          } else {
                            setSelectedTooth(num);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Vertical Midline Divider */}
              <div className="w-1 h-28 bg-blue-300 rounded-full mx-1 shrink-0 self-center shadow-xs" title="Línea Media Superior" />

              {/* Quadrant 2 (21 -> 28) */}
              <div className="flex flex-col items-start">
                <div className="flex items-center justify-between w-full mb-1.5 pl-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    Cuadrante 2 (Sup. Izq.)
                  </span>
                  {isFastCaptureActive && (
                    <button
                      type="button"
                      onClick={() => handleToggleQuadrant(QUADRANT_2)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      {QUADRANT_2.every((t) => selectedTeeth.has(t)) ? (
                        <>
                          <Square size={11} />
                          Deseleccionar Q2
                        </>
                      ) : (
                        <>
                          <CheckSquare size={11} />
                          Seleccionar Q2
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_2.map((num) => {
                    const isHealthy = Boolean(data?.teeth[num]?.currentlyHealthy);
                    const isSelected = isFastCaptureActive ? selectedTeeth.has(num) : selectedTooth === num;
                    const isConflicted = failureMap.has(num);
                    const conflictMsg = failureMap.get(num);

                    return (
                      <ToothGraphic
                        key={num}
                        toothNumber={num}
                        activeFindings={data?.teeth[num]?.activeFindings || []}
                        currentlyHealthy={isHealthy}
                        isSelected={isSelected}
                        isFastCaptureActive={isFastCaptureActive}
                        isConflicted={isConflicted}
                        conflictMessage={conflictMsg}
                        onClick={() => {
                          if (isFastCaptureActive) {
                            handleToggleToothSelection(num);
                          } else {
                            setSelectedTooth(num);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal Arch Separator / Occlusion Line */}
          <div className="relative flex items-center justify-center my-1">
            <div className="w-full border-t-2 border-slate-200 border-dashed" />
            <span className="absolute bg-white px-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-widest border border-slate-200 rounded-full py-0.5 shadow-2xs">
              Plano de Oclusión Dental
            </span>
          </div>

          {/* LOWER ARCH (MANDIBLE) */}
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-teal-500" />
                Arcada Inferior (Mandíbula)
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                Línea media central
              </span>
            </div>

            <div className="flex items-center justify-center gap-3">
              {/* Quadrant 4 (48 -> 41) */}
              <div className="flex flex-col items-end">
                <div className="flex items-center justify-between w-full mb-1.5 pr-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    Cuadrante 4 (Inf. Der.)
                  </span>
                  {isFastCaptureActive && (
                    <button
                      type="button"
                      onClick={() => handleToggleQuadrant(QUADRANT_4)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      {QUADRANT_4.every((t) => selectedTeeth.has(t)) ? (
                        <>
                          <Square size={11} />
                          Deseleccionar Q4
                        </>
                      ) : (
                        <>
                          <CheckSquare size={11} />
                          Seleccionar Q4
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_4.map((num) => {
                    const isHealthy = Boolean(data?.teeth[num]?.currentlyHealthy);
                    const isSelected = isFastCaptureActive ? selectedTeeth.has(num) : selectedTooth === num;
                    const isConflicted = failureMap.has(num);
                    const conflictMsg = failureMap.get(num);

                    return (
                      <ToothGraphic
                        key={num}
                        toothNumber={num}
                        activeFindings={data?.teeth[num]?.activeFindings || []}
                        currentlyHealthy={isHealthy}
                        isSelected={isSelected}
                        isFastCaptureActive={isFastCaptureActive}
                        isConflicted={isConflicted}
                        conflictMessage={conflictMsg}
                        onClick={() => {
                          if (isFastCaptureActive) {
                            handleToggleToothSelection(num);
                          } else {
                            setSelectedTooth(num);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Vertical Midline Divider */}
              <div className="w-1 h-28 bg-teal-300 rounded-full mx-1 shrink-0 self-center shadow-xs" title="Línea Media Inferior" />

              {/* Quadrant 3 (31 -> 38) */}
              <div className="flex flex-col items-start">
                <div className="flex items-center justify-between w-full mb-1.5 pl-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    Cuadrante 3 (Inf. Izq.)
                  </span>
                  {isFastCaptureActive && (
                    <button
                      type="button"
                      onClick={() => handleToggleQuadrant(QUADRANT_3)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      {QUADRANT_3.every((t) => selectedTeeth.has(t)) ? (
                        <>
                          <Square size={11} />
                          Deseleccionar Q3
                        </>
                      ) : (
                        <>
                          <CheckSquare size={11} />
                          Seleccionar Q3
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_3.map((num) => {
                    const isHealthy = Boolean(data?.teeth[num]?.currentlyHealthy);
                    const isSelected = isFastCaptureActive ? selectedTeeth.has(num) : selectedTooth === num;
                    const isConflicted = failureMap.has(num);
                    const conflictMsg = failureMap.get(num);

                    return (
                      <ToothGraphic
                        key={num}
                        toothNumber={num}
                        activeFindings={data?.teeth[num]?.activeFindings || []}
                        currentlyHealthy={isHealthy}
                        isSelected={isSelected}
                        isFastCaptureActive={isFastCaptureActive}
                        isConflicted={isConflicted}
                        conflictMessage={conflictMsg}
                        onClick={() => {
                          if (isFastCaptureActive) {
                            handleToggleToothSelection(num);
                          } else {
                            setSelectedTooth(num);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Chart Legend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <HelpCircle size={15} className="text-blue-500" />
          Convenciones del Odontograma
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-red-500 shrink-0 shadow-2xs" />
            <span className="text-slate-700 font-medium">Caries Activa</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-blue-500 shrink-0 shadow-2xs" />
            <span className="text-slate-700 font-medium">Restauración / Obturación</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-500 shrink-0 shadow-2xs" />
            <span className="text-slate-700 font-medium">Fractura Dental</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded border-2 border-red-500 flex items-center justify-center text-[9px] font-black text-red-500 shrink-0">
              X
            </span>
            <span className="text-slate-700 font-medium">Pieza Ausente</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 text-amber-950 flex items-center justify-center text-[8px] font-black shrink-0">
              C
            </span>
            <span className="text-slate-700 font-medium">Corona Protésica</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-purple-100 text-purple-700 flex items-center justify-center text-[8px] font-bold shrink-0">
              ENDO
            </span>
            <span className="text-slate-700 font-medium">Tratamiento de Conductos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500 text-white flex items-center justify-center text-[8px] font-black shrink-0">
              I
            </span>
            <span className="text-slate-700 font-medium">Implante Dental</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[9px] flex items-center gap-0.5 shrink-0">
              ✓ SANA
            </span>
            <span className="text-slate-700 font-medium">Evaluada como Sana</span>
          </div>
        </div>
      </div>

      {/* Selected Tooth Detail Modal (Single selection mode outside fast capture) */}
      {selectedTooth !== null && !isFastCaptureActive && (
        <ToothDetailModal
          patientId={patientId}
          toothNumber={selectedTooth}
          onClose={() => setSelectedTooth(null)}
          onFindingUpdated={loadOdontogram}
        />
      )}

      {/* Fast Capture Bottom Fixed Dock (Visible when Fast Capture is active) */}
      {isFastCaptureActive && (
        <FastCaptureDock
          selectedTeeth={selectedTeeth}
          onClearSelection={handleClearSelection}
          onExitFastCapture={handleToggleFastCapture}
          onOperationChanged={invalidateRequestId}
          onSubmitBatch={handleSubmitBatch}
          submitting={submittingBatch}
          failures={batchFailures}
          onRemoveConflictedTeeth={handleRemoveConflictedTeeth}
          resetTrigger={resetDockTrigger}
        />
      )}
    </div>
  );
};
