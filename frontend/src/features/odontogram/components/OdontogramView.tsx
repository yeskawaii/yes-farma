import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  HelpCircle,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { odontogramApi } from '../api';
import { ApiClientError } from '../../../core/api/client';
import type { OdontogramResponse } from '../types';
import { ToothGraphic } from './ToothGraphic';
import { ToothDetailModal } from './ToothDetailModal';

interface OdontogramViewProps {
  patientId: string;
}

const QUADRANT_1 = [18, 17, 16, 15, 14, 13, 12, 11];
const QUADRANT_2 = [21, 22, 23, 24, 25, 26, 27, 28];
const QUADRANT_4 = [48, 47, 46, 45, 44, 43, 42, 41];
const QUADRANT_3 = [31, 32, 33, 34, 35, 36, 37, 38];

export const OdontogramView: React.FC<OdontogramViewProps> = ({ patientId }) => {
  const [data, setData] = useState<OdontogramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

  useEffect(() => {
    loadOdontogram();
  }, [patientId]);

  const loadOdontogram = async () => {
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
  };

  // Initial loading state when no data exists yet (never render teeth as healthy)
  if (loading && data === null) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="h-6 bg-slate-200 rounded w-1/3" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-150">
      {/* Header & KPI Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Activity className="text-blue-600" size={22} />
              Odontograma Permanente (FDI)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registro dental longitudinal interactivo de 32 piezas permanentes. Haz clic en cualquier diente para ver o registrar hallazgos.
            </p>
          </div>

          <button
            onClick={loadOdontogram}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors text-xs font-semibold self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {/* Summary KPI Cards */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
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
                  Dientes con Hallazgos
                </p>
                <p className="text-xs text-indigo-700 font-medium">
                  De 32 piezas permanentes
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                {data.summary.missingTeethCount}
              </div>
              <div>
                <p className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                  Piezas Ausentes
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

      {/* 32 Teeth FDI Chart — Anatomical layout preserving 18..11|21..28 and 48..41|31..38 with horizontal scroll without flex-wrap */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-x-auto">
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
                <span className="text-[10px] font-bold text-slate-400 mb-1.5 pr-1">
                  Cuadrante 1 (Sup. Der.)
                </span>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_1.map((num) => (
                    <ToothGraphic
                      key={num}
                      toothNumber={num}
                      activeFindings={data?.teeth[num]?.activeFindings || []}
                      isSelected={selectedTooth === num}
                      onClick={() => setSelectedTooth(num)}
                    />
                  ))}
                </div>
              </div>

              {/* Vertical Midline Divider */}
              <div className="w-1 h-28 bg-blue-300 rounded-full mx-1 shrink-0 self-center shadow-xs" title="Línea Media Superior" />

              {/* Quadrant 2 (21 -> 28) */}
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold text-slate-400 mb-1.5 pl-1">
                  Cuadrante 2 (Sup. Izq.)
                </span>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_2.map((num) => (
                    <ToothGraphic
                      key={num}
                      toothNumber={num}
                      activeFindings={data?.teeth[num]?.activeFindings || []}
                      isSelected={selectedTooth === num}
                      onClick={() => setSelectedTooth(num)}
                    />
                  ))}
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
                <span className="text-[10px] font-bold text-slate-400 mb-1.5 pr-1">
                  Cuadrante 4 (Inf. Der.)
                </span>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_4.map((num) => (
                    <ToothGraphic
                      key={num}
                      toothNumber={num}
                      activeFindings={data?.teeth[num]?.activeFindings || []}
                      isSelected={selectedTooth === num}
                      onClick={() => setSelectedTooth(num)}
                    />
                  ))}
                </div>
              </div>

              {/* Vertical Midline Divider */}
              <div className="w-1 h-28 bg-teal-300 rounded-full mx-1 shrink-0 self-center shadow-xs" title="Línea Media Inferior" />

              {/* Quadrant 3 (31 -> 38) */}
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold text-slate-400 mb-1.5 pl-1">
                  Cuadrante 3 (Inf. Izq.)
                </span>
                <div className="flex gap-1.5 shrink-0">
                  {QUADRANT_3.map((num) => (
                    <ToothGraphic
                      key={num}
                      toothNumber={num}
                      activeFindings={data?.teeth[num]?.activeFindings || []}
                      isSelected={selectedTooth === num}
                      onClick={() => setSelectedTooth(num)}
                    />
                  ))}
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
            <span className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-300 shrink-0" />
            <span className="text-slate-700 font-medium">Superficie Sana</span>
          </div>
        </div>
      </div>

      {/* Selected Tooth Detail Modal */}
      {selectedTooth !== null && (
        <ToothDetailModal
          patientId={patientId}
          toothNumber={selectedTooth}
          onClose={() => setSelectedTooth(null)}
          onFindingUpdated={loadOdontogram}
        />
      )}
    </div>
  );
};
