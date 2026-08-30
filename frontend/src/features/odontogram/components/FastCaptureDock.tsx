import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Sparkles,
  ChevronUp,
  X,
  RotateCcw,
  AlertCircle,
  Loader2,
  MoreHorizontal
} from 'lucide-react';
import type { DentalFindingType, ToothSurface, BatchValidationFailure } from '../types';

interface FastCaptureDockProps {
  selectedTeeth: Set<number>;
  onClearSelection: () => void;
  onExitFastCapture: () => void;
  onOperationChanged: () => void;
  onSubmitBatch: (params: {
    actionType: 'HEALTHY' | DentalFindingType;
    surfaces: {
      hasOI: boolean;
      surfaces: ToothSurface[];
    };
    notes?: string | null;
  }) => Promise<void>;
  submitting: boolean;
  failures: BatchValidationFailure[];
  onRemoveConflictedTeeth: (toothNumbers: number[]) => void;
  resetTrigger?: number;
}

const PRIMARY_ACTIONS: Array<{
  type: 'HEALTHY' | DentalFindingType;
  label: string;
  badgeColor: string;
  activeColor: string;
  isSurfaceOriented: boolean;
}> = [
  {
    type: 'HEALTHY',
    label: 'Sano',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    activeColor: 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/40',
    isSurfaceOriented: false
  },
  {
    type: 'CARIES',
    label: 'Caries',
    badgeColor: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    activeColor: 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/40',
    isSurfaceOriented: true
  },
  {
    type: 'RESTORATION',
    label: 'Restauración',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    activeColor: 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/40',
    isSurfaceOriented: true
  },
  {
    type: 'FRACTURE',
    label: 'Fractura',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
    activeColor: 'bg-orange-600 text-white border-orange-600 shadow-sm ring-2 ring-orange-500/40',
    isSurfaceOriented: true
  },
  {
    type: 'CROWN',
    label: 'Corona',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    activeColor: 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/40',
    isSurfaceOriented: false
  },
  {
    type: 'ENDODONTIC_TREATMENT',
    label: 'Endodoncia',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    activeColor: 'bg-purple-600 text-white border-purple-600 shadow-sm ring-2 ring-purple-500/40',
    isSurfaceOriented: false
  },
  {
    type: 'MISSING',
    label: 'Ausente',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
    activeColor: 'bg-rose-600 text-white border-rose-600 shadow-sm ring-2 ring-rose-500/40',
    isSurfaceOriented: false
  }
];

const MORE_ACTIONS: Array<{
  type: DentalFindingType;
  label: string;
  isSurfaceOriented: boolean;
}> = [
  { type: 'IMPLANT', label: 'Implante Dental', isSurfaceOriented: false },
  { type: 'EXTRACTION_INDICATED', label: 'Extracción Indicada', isSurfaceOriented: false },
  { type: 'PROSTHESIS', label: 'Prótesis / Póntico', isSurfaceOriented: false },
  { type: 'OTHER', label: 'Otro Hallazgo', isSurfaceOriented: true }
];

export const FastCaptureDock: React.FC<FastCaptureDockProps> = ({
  selectedTeeth,
  onClearSelection,
  onExitFastCapture,
  onOperationChanged,
  onSubmitBatch,
  submitting,
  failures,
  onRemoveConflictedTeeth,
  resetTrigger = 0
}) => {
  const [selectedAction, setSelectedAction] = useState<'HEALTHY' | DentalFindingType | null>(null);
  const [hasOI, setHasOI] = useState(true);
  const [activeSurfaces, setActiveSurfaces] = useState<ToothSurface[]>([]);
  const [isWholeTooth, setIsWholeTooth] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  // Reset internal states on resetTrigger or when selection is empty
  useEffect(() => {
    setSelectedAction(null);
    setHasOI(false);
    setActiveSurfaces([]);
    setIsWholeTooth(false);
    setIsMoreOpen(false);
    setNotes('');
    setShowNotes(false);
  }, [resetTrigger]);

  const selectedCount = selectedTeeth.size;
  const isActionSurfaceOriented =
    selectedAction === 'CARIES' ||
    selectedAction === 'RESTORATION' ||
    selectedAction === 'FRACTURE' ||
    selectedAction === 'OTHER';

  const handleSelectAction = (action: 'HEALTHY' | DentalFindingType) => {
    setSelectedAction(action);
    setIsMoreOpen(false);
    onOperationChanged();

    if (action === 'HEALTHY' || !['CARIES', 'RESTORATION', 'FRACTURE', 'OTHER'].includes(action)) {
      setHasOI(false);
      setActiveSurfaces([]);
      setIsWholeTooth(true);
    } else {
      // Default to O/I for surface findings
      setHasOI(true);
      setActiveSurfaces([]);
      setIsWholeTooth(false);
    }
  };

  const handleToggleSurface = (surface: 'OI' | 'MESIAL' | 'DISTAL' | 'VESTIBULAR' | 'LINGUAL_PALATAL' | 'WHOLE_TOOTH') => {
    onOperationChanged();

    if (surface === 'WHOLE_TOOTH') {
      setIsWholeTooth(true);
      setHasOI(false);
      setActiveSurfaces([]);
      return;
    }

    setIsWholeTooth(false);

    if (surface === 'OI') {
      const nextOI = !hasOI;
      setHasOI(nextOI);
      return;
    }

    let updated = activeSurfaces.includes(surface)
      ? activeSurfaces.filter((s) => s !== surface)
      : [...activeSurfaces, surface];

    setActiveSurfaces(updated);
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    onOperationChanged();
  };

  const handleSubmit = async () => {
    if (selectedCount === 0 || selectedAction === null || submitting) return;

    let finalSurfaces: ToothSurface[] = [];
    if (isWholeTooth) {
      finalSurfaces = ['WHOLE_TOOTH'];
    } else {
      finalSurfaces = [...activeSurfaces];
    }

    await onSubmitBatch({
      actionType: selectedAction,
      surfaces: {
        hasOI,
        surfaces: finalSurfaces
      },
      notes: notes.trim() ? notes.trim() : null
    });
  };

  // Generate readable summary text
  const actionLabel =
    selectedAction === null
      ? null
      : selectedAction === 'HEALTHY'
      ? 'Sano'
      : PRIMARY_ACTIONS.find((a) => a.type === selectedAction)?.label ||
        MORE_ACTIONS.find((a) => a.type === selectedAction)?.label ||
        selectedAction;

  let surfacesSummary = '';
  if (selectedAction && isActionSurfaceOriented) {
    if (isWholeTooth) {
      surfacesSummary = 'Pieza completa';
    } else {
      const parts: string[] = [];
      if (hasOI) parts.push('Oclusal/Incisal');
      if (activeSurfaces.includes('MESIAL')) parts.push('Mesial');
      if (activeSurfaces.includes('DISTAL')) parts.push('Distal');
      if (activeSurfaces.includes('VESTIBULAR')) parts.push('Vestibular');
      if (activeSurfaces.includes('LINGUAL_PALATAL')) parts.push('Lingual/Palatino');
      surfacesSummary = parts.length > 0 ? parts.join(', ') : 'Sin superficie seleccionada';
    }
  }

  const sortedSelectedTeeth = Array.from(selectedTeeth).sort((a, b) => a - b);
  const teethListString =
    sortedSelectedTeeth.length <= 6
      ? sortedSelectedTeeth.join(', ')
      : `${sortedSelectedTeeth.slice(0, 5).join(', ')}... (+${sortedSelectedTeeth.length - 5})`;

  const hasSurfaceSelection =
    selectedAction === null ||
    !isActionSurfaceOriented ||
    isWholeTooth ||
    hasOI ||
    activeSurfaces.length > 0;

  const isSubmitDisabled =
    selectedCount === 0 ||
    selectedAction === null ||
    submitting ||
    !hasSurfaceSelection;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-indigo-200 shadow-2xl p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto transition-all duration-200 animate-in slide-in-from-bottom-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-3">
        {/* Failures Alert Banner if any conflicts exist */}
        {failures.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 animate-in fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Conflicto en {failures.length} pieza{failures.length > 1 ? 's' : ''}:</span>{' '}
                {failures.map((f) => `P.${f.toothNumber} (${f.reasonMessage})`).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemoveConflictedTeeth(failures.map((f) => f.toothNumber))}
              className="px-3 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold rounded-lg transition-colors shrink-0 text-center cursor-pointer"
            >
              Desmarcar piezas en conflicto
            </button>
          </div>
        )}

        {/* Top Control Bar: Selection count, summary, clear, exit */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-900 rounded-full font-bold text-xs">
              <Sparkles size={13} className="text-indigo-600" />
              {selectedCount} pieza{selectedCount !== 1 ? 's' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}
            </span>

            {selectedCount > 0 && (
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                [{teethListString}]
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                disabled={submitting}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw size={13} />
                Limpiar
              </button>
            )}

            <button
              type="button"
              onClick={onExitFastCapture}
              disabled={submitting}
              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <X size={14} />
              Salir
            </button>
          </div>
        </div>

        {/* Action Pills Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {PRIMARY_ACTIONS.map((action) => {
            const isSelected = selectedAction === action.type;
            return (
              <button
                key={action.type}
                type="button"
                onClick={() => handleSelectAction(action.type)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isSelected ? action.activeColor : action.badgeColor
                }`}
              >
                {action.type === 'HEALTHY' && <CheckCircle2 size={14} />}
                {action.label}
              </button>
            );
          })}

          {/* More actions button & dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                MORE_ACTIONS.some((a) => a.type === selectedAction)
                  ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <MoreHorizontal size={14} />
              Más
              <ChevronUp
                size={13}
                className={`transition-transform duration-200 ${isMoreOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isMoreOpen && (
              <div className="absolute bottom-full mb-2 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 w-48 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95">
                <span className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Otros Hallazgos
                </span>
                {MORE_ACTIONS.map((action) => (
                  <button
                    key={action.type}
                    type="button"
                    onClick={() => handleSelectAction(action.type)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      selectedAction === action.type
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Surface Selector (Shown exclusively for surface-oriented findings) */}
        {selectedAction !== null && isActionSurfaceOriented && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1">
              Superficies:
            </span>

            <button
              type="button"
              onClick={() => handleToggleSurface('OI')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                hasOI && !isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Oclusal para premolares/molares, Incisal para incisivos/caninos"
            >
              O / I
            </button>

            <button
              type="button"
              onClick={() => handleToggleSurface('MESIAL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeSurfaces.includes('MESIAL') && !isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Mesial (M)
            </button>

            <button
              type="button"
              onClick={() => handleToggleSurface('DISTAL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeSurfaces.includes('DISTAL') && !isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Distal (D)
            </button>

            <button
              type="button"
              onClick={() => handleToggleSurface('VESTIBULAR')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeSurfaces.includes('VESTIBULAR') && !isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Vestibular (V)
            </button>

            <button
              type="button"
              onClick={() => handleToggleSurface('LINGUAL_PALATAL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeSurfaces.includes('LINGUAL_PALATAL') && !isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Lingual/Palatino (L/P)
            </button>

            <button
              type="button"
              onClick={() => handleToggleSurface('WHOLE_TOOTH')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isWholeTooth
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Pieza Completa
            </button>
          </div>
        )}

        {/* Optional Notes Toggle & Input (Aligned with backend 2000 char max) */}
        {showNotes ? (
          <div className="flex items-center gap-2 animate-in fade-in">
            <input
              type="text"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Observaciones clínicas opcionales para este lote..."
              className="flex-1 text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              maxLength={2000}
            />
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 cursor-pointer font-medium"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
            >
              + Añadir nota opcional
            </button>
          </div>
        )}

        {/* Bottom Submission Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="text-xs text-slate-600">
            {actionLabel ? (
              <>
                <span className="font-extrabold text-slate-900">{actionLabel}</span>
                {isActionSurfaceOriented && surfacesSummary && (
                  <span className="text-slate-500"> · {surfacesSummary}</span>
                )}
                {selectedCount > 0 ? (
                  <span className="text-indigo-700 font-bold"> · {selectedCount} pieza{selectedCount !== 1 ? 's' : ''}</span>
                ) : (
                  <span className="text-slate-400"> · Toca piezas para seleccionar</span>
                )}
              </>
            ) : (
              <span className="text-slate-500 font-medium">
                {selectedCount > 0
                  ? `${selectedCount} pieza${selectedCount !== 1 ? 's' : ''} seleccionada${selectedCount !== 1 ? 's' : ''} — Elige una acción clínica`
                  : 'Toca piezas y elige una acción clínica'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
              selectedAction === 'HEALTHY'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-200 disabled:text-slate-400'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-200 disabled:text-slate-400'
            }`}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Guardando lote...
              </>
            ) : selectedCount === 0 ? (
              'Selecciona piezas'
            ) : selectedAction === null ? (
              'Elige una acción'
            ) : (
              `Aplicar a ${selectedCount} pieza${selectedCount !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
