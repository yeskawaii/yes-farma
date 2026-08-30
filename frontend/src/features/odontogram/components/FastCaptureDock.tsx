import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Sparkles,
  ChevronUp,
  X,
  RotateCcw,
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Check
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
  onHeightChange?: (height: number) => void;
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
  resetTrigger = 0,
  onHeightChange
}) => {
  const [selectedAction, setSelectedAction] = useState<'HEALTHY' | DentalFindingType | null>(null);
  const [hasOI, setHasOI] = useState(false);
  const [activeSurfaces, setActiveSurfaces] = useState<ToothSurface[]>([]);
  const [isWholeTooth, setIsWholeTooth] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [popoverCoords, setPopoverCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const selectedCount = selectedTeeth.size;
  const isActionSurfaceOriented =
    selectedAction === 'CARIES' ||
    selectedAction === 'RESTORATION' ||
    selectedAction === 'FRACTURE' ||
    selectedAction === 'OTHER';

  // Measure dock height using ResizeObserver
  useEffect(() => {
    if (!dockRef.current) return;
    const el = dockRef.current;

    const reportHeight = () => {
      onHeightChange?.(el.offsetHeight);
    };

    reportHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        reportHeight();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [onHeightChange, isActionSurfaceOriented, showNotes, failures.length]);

  // Reset internal states on resetTrigger
  useEffect(() => {
    setSelectedAction(null);
    setHasOI(false);
    setActiveSurfaces([]);
    setIsWholeTooth(false);
    setIsMoreOpen(false);
    setNotes('');
    setShowNotes(false);
  }, [resetTrigger]);

  const updatePopoverPosition = useCallback(() => {
    if (!moreButtonRef.current) return;
    const rect = moreButtonRef.current.getBoundingClientRect();
    const popoverWidth = 220;
    const gap = 8;

    // Horizontal placement: right-aligned with button, bounded by viewport margins
    let left = rect.right - popoverWidth;
    const minLeft = 12;
    const maxLeft = window.innerWidth - popoverWidth - 12;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove >= 180 || spaceAbove > spaceBelow) {
      setPopoverCoords({
        bottom: window.innerHeight - rect.top + gap,
        left,
        maxHeight: Math.min(spaceAbove - gap - 12, 320)
      });
    } else {
      setPopoverCoords({
        top: rect.bottom + gap,
        left,
        maxHeight: Math.min(spaceBelow - gap - 12, 320)
      });
    }
  }, []);

  // Handle outside click, escape, and window repositioning when More popover is open
  useEffect(() => {
    if (!isMoreOpen) return;

    updatePopoverPosition();

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(target)
      ) {
        setIsMoreOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };

    const handleReposition = () => {
      updatePopoverPosition();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition, { passive: true });
    window.addEventListener('scroll', handleReposition, { passive: true, capture: true });

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, { capture: true });
    };
  }, [isMoreOpen, updatePopoverPosition]);

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

  const handleToggleMore = () => {
    if (isMoreOpen) {
      setIsMoreOpen(false);
    } else {
      updatePopoverPosition();
      setIsMoreOpen(true);
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

  const hasSurfaceSelection =
    selectedAction === null ||
    !isActionSurfaceOriented ||
    isWholeTooth ||
    hasOI ||
    activeSurfaces.length > 0;

  const isSubmitDisabled =
    selectedCount === 0 ||
    selectedAction === null ||
    !hasSurfaceSelection ||
    submitting;

  const isMoreActionSelected = MORE_ACTIONS.some((a) => a.type === selectedAction);

  return (
    <>
      <div
        ref={dockRef}
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-indigo-200 shadow-2xl p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto transition-all duration-200 animate-in slide-in-from-bottom-6"
      >
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          {/* Header row: Selection counter & Quick Actions */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs">
                {selectedCount}
              </span>
              <span className="text-xs font-bold text-slate-800">
                {selectedCount === 1 ? '1 pieza seleccionada' : `${selectedCount} piezas seleccionadas`}
              </span>
              {selectedCount === 0 && (
                <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                  — Toca los dientes arriba para seleccionar
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer touch-manipulation"
                >
                  <RotateCcw size={13} />
                  Limpiar
                </button>
              )}

              <button
                type="button"
                onClick={onExitFastCapture}
                disabled={submitting}
                className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer touch-manipulation min-h-[36px]"
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
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 touch-manipulation min-h-[40px] ${
                    isSelected ? action.activeColor : action.badgeColor
                  }`}
                >
                  {action.type === 'HEALTHY' && <CheckCircle2 size={14} />}
                  {action.label}
                </button>
              );
            })}

            {/* More actions floating toggle button */}
            <button
              ref={moreButtonRef}
              id="more-actions-btn"
              type="button"
              aria-expanded={isMoreOpen}
              aria-haspopup="menu"
              aria-controls="more-actions-popover"
              onClick={handleToggleMore}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 touch-manipulation min-h-[40px] ${
                isMoreActionSelected
                  ? 'bg-slate-800 text-white border-slate-800 shadow-sm ring-2 ring-slate-700/40'
                  : isMoreOpen
                  ? 'bg-slate-200 text-slate-900 border-slate-300'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <MoreHorizontal size={14} />
              {isMoreActionSelected
                ? MORE_ACTIONS.find((a) => a.type === selectedAction)?.label || 'Más'
                : 'Más'}
              <ChevronUp
                size={13}
                className={`transition-transform duration-200 ${isMoreOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Surface Selector (Shown exclusively for surface-oriented findings) */}
          {selectedAction !== null && isActionSurfaceOriented && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1">
                Superficies:
              </span>

              <button
                type="button"
                onClick={() => handleToggleSurface('OI')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
                  activeSurfaces.includes('LINGUAL_PALATAL') && !isWholeTooth
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Lingual / Palatino (L/P)
              </button>

              <button
                type="button"
                onClick={() => handleToggleSurface('WHOLE_TOOTH')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer touch-manipulation min-h-[38px] ${
                  isWholeTooth
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Pieza Completa
              </button>
            </div>
          )}

          {/* Conflict Warning Alert if Batch Validation failed */}
          {failures.length > 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong className="font-bold">{failures.length} pieza(s)</strong> no pueden registrarse con esta acción.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveConflictedTeeth(failures.map((f) => f.toothNumber))}
                className="px-2 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded font-bold text-[11px] transition-colors cursor-pointer"
              >
                Excluir en conflicto
              </button>
            </div>
          )}

          {/* Optional Notes Section */}
          {showNotes && (
            <div className="flex flex-col gap-1 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <label htmlFor="fast-capture-notes" className="font-semibold">
                  Nota clínica común (opcional):
                </label>
                <span className="text-[10px] text-slate-400">
                  {notes.length}/2000
                </span>
              </div>
              <textarea
                id="fast-capture-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Observaciones clínicas aplicables a las piezas seleccionadas..."
                className="w-full text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          )}

          {/* Bottom Action Bar: Preview & Apply Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNotes(!showNotes)}
                className="text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 cursor-pointer py-1"
              >
                <span>{showNotes ? '— Ocultar nota' : '+ Agregar nota'}</span>
                {notes.trim() && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </button>

              {/* Dynamic operation preview badge */}
              {selectedAction !== null && (
                <div className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{actionLabel}</span>
                  {surfacesSummary && (
                    <span className="text-slate-500">· {surfacesSummary}</span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-extrabold text-sm shadow-md hover:shadow-lg disabled:shadow-none transition-all cursor-pointer disabled:cursor-not-allowed touch-manipulation min-h-[44px]"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Aplicando en {selectedCount} piezas...</span>
                </>
              ) : selectedAction === null ? (
                <span>Elige una acción</span>
              ) : selectedCount === 0 ? (
                <span>Selecciona piezas arriba</span>
              ) : !hasSurfaceSelection ? (
                <span>Selecciona superficie</span>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>
                    Aplicar {actionLabel} a {selectedCount} {selectedCount === 1 ? 'pieza' : 'piezas'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Floating More Actions Popover (Rendered at document.body level) */}
      {isMoreOpen && popoverCoords && createPortal(
        <div
          ref={popoverRef}
          id="more-actions-popover"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="more-actions-btn"
          style={{
            position: 'fixed',
            left: `${popoverCoords.left}px`,
            ...(popoverCoords.top !== undefined ? { top: `${popoverCoords.top}px` } : {}),
            ...(popoverCoords.bottom !== undefined ? { bottom: `${popoverCoords.bottom}px` } : {}),
            maxHeight: `${popoverCoords.maxHeight}px`,
            width: '220px',
            zIndex: 90
          }}
          className="bg-white/98 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
        >
          <span className="text-[10px] font-extrabold text-slate-400 px-3 py-1 uppercase tracking-wider">
            Otros Hallazgos
          </span>
          {MORE_ACTIONS.map((action) => {
            const isSelected = selectedAction === action.type;
            return (
              <button
                key={action.type}
                role="menuitem"
                type="button"
                onClick={() => handleSelectAction(action.type)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-between touch-manipulation min-h-[44px] ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                <span>{action.label}</span>
                {isSelected && <Check size={14} className="stroke-[3]" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};
