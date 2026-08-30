import React, { useState } from 'react';
import { ToothGraphic } from './ToothGraphic';
import type { OdontogramResponse, BatchValidationFailure } from '../types';
import { CheckSquare, Square } from 'lucide-react';

interface MobileQuadrantViewProps {
  data: OdontogramResponse | null;
  selectedTeeth: Set<number>;
  onToggleTooth: (toothNumber: number) => void;
  onToggleQuadrant: (quadrantTeeth: number[]) => void;
  failures: BatchValidationFailure[];
}

const QUADRANTS: Array<{
  id: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  label: string;
  subLabel: string;
  teeth: number[];
}> = [
  {
    id: 'Q1',
    label: 'Q1',
    subLabel: 'Superior Derecho',
    teeth: [18, 17, 16, 15, 14, 13, 12, 11]
  },
  {
    id: 'Q2',
    label: 'Q2',
    subLabel: 'Superior Izquierdo',
    teeth: [21, 22, 23, 24, 25, 26, 27, 28]
  },
  {
    id: 'Q3',
    label: 'Q3',
    subLabel: 'Inferior Izquierdo',
    teeth: [31, 32, 33, 34, 35, 36, 37, 38]
  },
  {
    id: 'Q4',
    label: 'Q4',
    subLabel: 'Inferior Derecho',
    teeth: [48, 47, 46, 45, 44, 43, 42, 41]
  }
];

export const MobileQuadrantView: React.FC<MobileQuadrantViewProps> = ({
  data,
  selectedTeeth,
  onToggleTooth,
  onToggleQuadrant,
  failures
}) => {
  const [activeQuadrantId, setActiveQuadrantId] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');

  const activeQuadrant = QUADRANTS.find((q) => q.id === activeQuadrantId) || QUADRANTS[0]!;

  const countForQuadrant = (teeth: number[]) => {
    return teeth.filter((t) => selectedTeeth.has(t)).length;
  };

  const isAllQuadrantSelected = activeQuadrant.teeth.every((t) => selectedTeeth.has(t));

  const failureMap = new Map<number, string>();
  for (const f of failures) {
    failureMap.set(f.toothNumber, f.reasonMessage);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Quadrant Tabs with Badges */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-2xl">
        {QUADRANTS.map((quadrant) => {
          const count = countForQuadrant(quadrant.teeth);
          const isActive = activeQuadrantId === quadrant.id;

          return (
            <button
              key={quadrant.id}
              type="button"
              onClick={() => setActiveQuadrantId(quadrant.id)}
              className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                isActive
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-1">
                <span>{quadrant.label}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-800'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium text-slate-400 truncate max-w-full">
                {quadrant.subLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Quadrant Header & Quick-Select Action */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            Cuadrante {activeQuadrant.id} — {activeQuadrant.subLabel}
          </h4>
          <p className="text-[11px] text-slate-500">
            8 piezas dentales permanentes
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleQuadrant(activeQuadrant.teeth)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          {isAllQuadrantSelected ? (
            <>
              <Square size={14} className="text-slate-500" />
              Deseleccionar {activeQuadrant.id}
            </>
          ) : (
            <>
              <CheckSquare size={14} className="text-indigo-600" />
              Seleccionar {activeQuadrant.id}
            </>
          )}
        </button>
      </div>

      {/* Grid of 8 Teeth for this Quadrant */}
      <div className="grid grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 justify-items-center">
        {activeQuadrant.teeth.map((toothNumber) => {
          const toothFindings = data?.teeth[toothNumber]?.activeFindings || [];
          const isHealthy = Boolean(data?.teeth[toothNumber]?.currentlyHealthy);
          const isSelected = selectedTeeth.has(toothNumber);
          const isConflicted = failureMap.has(toothNumber);
          const conflictMsg = failureMap.get(toothNumber);

          return (
            <ToothGraphic
              key={toothNumber}
              toothNumber={toothNumber}
              activeFindings={toothFindings}
              currentlyHealthy={isHealthy}
              isSelected={isSelected}
              isFastCaptureActive={true}
              isConflicted={isConflicted}
              conflictMessage={conflictMsg}
              onClick={() => onToggleTooth(toothNumber)}
            />
          );
        })}
      </div>
    </div>
  );
};
