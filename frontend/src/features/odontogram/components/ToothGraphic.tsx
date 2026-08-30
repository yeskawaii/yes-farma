import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { DentalFindingItem, ToothSurface } from '../types';
import { FDI_TOOTH_NAMES } from '../types';

interface ToothGraphicProps {
  toothNumber: number;
  activeFindings?: DentalFindingItem[];
  currentlyHealthy?: boolean;
  isSelected?: boolean;
  isFastCaptureActive?: boolean;
  isConflicted?: boolean;
  conflictMessage?: string;
  onClick?: () => void;
}

const SURFACE_COLOR_MAP: Record<string, string> = {
  CARIES: '#ef4444', // Red
  RESTORATION: '#3b82f6', // Blue
  FRACTURE: '#f97316' // Orange
};

const SURFACE_ORIENTED_TYPES = ['CARIES', 'RESTORATION', 'FRACTURE'] as const;

export const ToothGraphic: React.FC<ToothGraphicProps> = ({
  toothNumber,
  activeFindings = [],
  currentlyHealthy = false,
  isSelected = false,
  isFastCaptureActive = false,
  isConflicted = false,
  conflictMessage,
  onClick
}) => {
  const isUpper = toothNumber < 30; // 11-28 is Upper (Maxillary), 31-48 is Lower (Mandibular)
  const isRightQuadrant = (toothNumber >= 11 && toothNumber <= 18) || (toothNumber >= 41 && toothNumber <= 48); // Q1 and Q4
  const isAnterior = [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43].includes(toothNumber);

  // Surface mapping based on anatomical position:
  // Upper teeth: Top is Vestibular, Bottom is Palatal
  // Lower teeth: Top is Lingual, Bottom is Vestibular
  const topSurface: ToothSurface = isUpper ? 'VESTIBULAR' : 'LINGUAL_PALATAL';
  const bottomSurface: ToothSurface = isUpper ? 'LINGUAL_PALATAL' : 'VESTIBULAR';

  // Midline orientation:
  // Q1 (18->11) & Q4 (48->41): 11 & 41 are closest to midline (Right in chart is towards center/mesial)
  // Q2 (21->28) & Q3 (31->38): 21 & 31 are closest to midline (Left in chart is towards center/mesial)
  const leftSurface: ToothSurface = isRightQuadrant ? 'DISTAL' : 'MESIAL';
  const rightSurface: ToothSurface = isRightQuadrant ? 'MESIAL' : 'DISTAL';
  const centerSurface: ToothSurface = isAnterior ? 'INCISAL' : 'OCCLUSAL';

  const getSurfaceVisual = (surface: ToothSurface) => {
    // Only CARIES, RESTORATION, FRACTURE participate in surface fill
    const matchingTypesSet = new Set<string>();

    for (const finding of activeFindings) {
      if (
        (SURFACE_ORIENTED_TYPES as readonly string[]).includes(finding.findingType) &&
        (finding.surfaces.includes(surface) || finding.surfaces.includes('WHOLE_TOOTH'))
      ) {
        matchingTypesSet.add(finding.findingType);
      }
    }

    const types = Array.from(matchingTypesSet).sort();

    if (types.length === 0) {
      return { fill: '#f8fafc', isMixed: false, patternId: null, colors: [] };
    }

    if (types.length === 1) {
      const color = SURFACE_COLOR_MAP[types[0]!] || '#e2e8f0';
      return { fill: color, isMixed: false, patternId: null, colors: [color] };
    }

    // Multiple surface findings -> deterministic SVG striped pattern
    const patternId = `mixed-pat-${toothNumber}-${surface.toLowerCase()}`;
    const colors = types.map((t) => SURFACE_COLOR_MAP[t] || '#94a3b8');
    return { fill: `url(#${patternId})`, isMixed: true, patternId, colors };
  };

  const isMissing = activeFindings.some((f) => f.findingType === 'MISSING');
  const hasCrown = activeFindings.some((f) => f.findingType === 'CROWN');
  const hasEndo = activeFindings.some((f) => f.findingType === 'ENDODONTIC_TREATMENT');
  const hasImplant = activeFindings.some((f) => f.findingType === 'IMPLANT');
  const hasExtraction = activeFindings.some((f) => f.findingType === 'EXTRACTION_INDICATED');
  const hasProsthesis = activeFindings.some((f) => f.findingType === 'PROSTHESIS');
  const hasOther = activeFindings.some((f) => f.findingType === 'OTHER');

  const topVisual = getSurfaceVisual(topSurface);
  const bottomVisual = getSurfaceVisual(bottomSurface);
  const leftVisual = getSurfaceVisual(leftSurface);
  const rightVisual = getSurfaceVisual(rightSurface);
  const centerVisual = getSurfaceVisual(centerSurface);

  const mixedVisuals = [topVisual, bottomVisual, leftVisual, rightVisual, centerVisual].filter(
    (v) => v.isMixed && v.patternId
  );

  const toothName = FDI_TOOTH_NAMES[toothNumber] || `Pieza ${toothNumber}`;
  const statusDescription = currentlyHealthy
    ? 'Evaluada clínicamente como Sana'
    : activeFindings.length === 0
    ? 'Sin hallazgos activos'
    : `${activeFindings.length} hallazgo${activeFindings.length > 1 ? 's' : ''} activo${
        activeFindings.length > 1 ? 's' : ''
      }`;

  const accessibleLabel = `Pieza FDI ${toothNumber} - ${toothName}: ${statusDescription}${
    isSelected ? ' (Seleccionada)' : ''
  }${isConflicted ? ` - Advertencia: ${conflictMessage || 'Conflicto clínico'}` : ''}`;

  // Styling based on mode and state
  let containerStyleClasses = 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs';

  if (isFastCaptureActive) {
    if (isSelected && isConflicted) {
      containerStyleClasses =
        'bg-amber-50/80 border-2 border-amber-500 ring-2 ring-indigo-500 shadow-md scale-105 z-10';
    } else if (isSelected) {
      containerStyleClasses =
        'bg-indigo-50/80 border-2 border-indigo-600 ring-2 ring-indigo-500/40 shadow-md scale-105 z-10';
    } else if (isConflicted) {
      containerStyleClasses =
        'bg-amber-50/70 border-2 border-amber-500 ring-2 ring-amber-400/40 shadow-sm scale-102 z-10';
    } else {
      containerStyleClasses =
        'bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 hover:scale-[1.02]';
    }
  } else if (isSelected) {
    containerStyleClasses = 'bg-blue-50 border-2 border-blue-500 shadow-md scale-105 z-10';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-center p-2 rounded-xl cursor-pointer transition-all duration-150 select-none text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 touch-manipulation ${containerStyleClasses}`}
      style={{ minWidth: '54px', width: '56px', minHeight: '88px' }}
      title={conflictMessage || accessibleLabel}
    >
      {/* Conflict Warning Badge */}
      {isConflicted && (
        <div
          className="absolute -top-1.5 -left-1.5 z-30 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-xs border border-white"
          title={conflictMessage || 'Conflicto en lote'}
        >
          <AlertTriangle size={10} strokeWidth={3} />
        </div>
      )}

      {/* Fast Capture Selection Checkmark Badge */}
      {isFastCaptureActive && isSelected && (
        <div className="absolute -top-1.5 -right-1.5 z-20 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xs border border-white">
          <Check size={10} strokeWidth={3} />
        </div>
      )}

      {/* Top Number for Upper Teeth */}
      {isUpper && (
        <span
          className={`text-xs font-bold mb-1 ${
            isFastCaptureActive && isSelected
              ? 'text-indigo-800 font-extrabold'
              : isSelected
              ? 'text-blue-700'
              : 'text-slate-700'
          }`}
        >
          {toothNumber}
        </span>
      )}

      {/* SVG Tooth Diagram */}
      <div className="relative w-9 h-9 my-auto">
        <svg
          viewBox="0 0 100 100"
          className={`w-full h-full ${
            hasCrown ? 'stroke-amber-500 stroke-[3px]' : ''
          }`}
        >
          <defs>
            {mixedVisuals.map((v) => (
              <pattern
                key={v.patternId}
                id={v.patternId!}
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                {v.colors.length === 2 ? (
                  <>
                    <rect width="4" height="8" fill={v.colors[0]} />
                    <rect x="4" width="4" height="8" fill={v.colors[1]} />
                  </>
                ) : (
                  <>
                    <rect width="2.6" height="8" fill={v.colors[0]} />
                    <rect x="2.6" width="2.6" height="8" fill={v.colors[1]} />
                    <rect x="5.2" width="2.8" height="8" fill={v.colors[2]} />
                  </>
                )}
              </pattern>
            ))}
          </defs>

          {/* Tooth Surfaces Group (dimmed only when missing, retaining full contrast on symbols & numbers) */}
          <g className={`transition-opacity ${isMissing ? 'opacity-25' : 'opacity-100'}`}>
            {/* Top Surface */}
            <polygon
              points="10,10 90,10 70,30 30,30"
              fill={topVisual.fill}
              stroke="#94a3b8"
              strokeWidth="2"
              className="transition-colors"
            />

            {/* Bottom Surface */}
            <polygon
              points="30,70 70,70 90,90 10,90"
              fill={bottomVisual.fill}
              stroke="#94a3b8"
              strokeWidth="2"
              className="transition-colors"
            />

            {/* Left Surface */}
            <polygon
              points="10,10 30,30 30,70 10,90"
              fill={leftVisual.fill}
              stroke="#94a3b8"
              strokeWidth="2"
              className="transition-colors"
            />

            {/* Right Surface */}
            <polygon
              points="90,10 90,90 70,70 70,30"
              fill={rightVisual.fill}
              stroke="#94a3b8"
              strokeWidth="2"
              className="transition-colors"
            />

            {/* Center Surface (Occlusal/Incisal) */}
            {isAnterior ? (
              <rect
                x="30"
                y="38"
                width="40"
                height="24"
                rx="3"
                fill={centerVisual.fill}
                stroke="#94a3b8"
                strokeWidth="2"
                className="transition-colors"
              />
            ) : (
              <polygon
                points="30,30 70,30 70,70 30,70"
                fill={centerVisual.fill}
                stroke="#94a3b8"
                strokeWidth="2"
                className="transition-colors"
              />
            )}
          </g>

          {/* Missing X Overlay (full contrast) */}
          {isMissing && (
            <g stroke="#ef4444" strokeWidth="4" strokeLinecap="round">
              <line x1="12" y1="12" x2="88" y2="88" />
              <line x1="88" y1="12" x2="12" y2="88" />
            </g>
          )}

          {/* Extraction Indicated Symbol */}
          {hasExtraction && !isMissing && (
            <g stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 3">
              <line x1="15" y1="15" x2="85" y2="85" />
              <line x1="85" y1="15" x2="15" y2="85" />
            </g>
          )}

          {/* Endodontic Treatment Vertical Line */}
          {hasEndo && (
            <line
              x1="50"
              y1="8"
              x2="50"
              y2="92"
              stroke="#8b5cf6"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}
        </svg>

        {/* Crown Indicator */}
        {hasCrown && (
          <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 text-amber-950 rounded-full flex items-center justify-center text-[8px] font-black shadow-xs">
            C
          </div>
        )}

        {/* Implant Indicator */}
        {hasImplant && (
          <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-xs">
            I
          </div>
        )}
      </div>

      {/* Badges indicators for multiple findings and Healthy Indicator */}
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 max-w-full">
        {currentlyHealthy && !isMissing && (
          <span
            className="px-1 py-0.2 text-[8px] font-extrabold bg-emerald-100 text-emerald-800 rounded flex items-center gap-0.5 shadow-3xs"
            title="Evaluada como Sana (HEALTHY)"
          >
            <Check size={8} strokeWidth={3} />
            SANA
          </span>
        )}
        {hasEndo && (
          <span className="px-1 py-0.2 text-[8px] font-bold bg-purple-100 text-purple-700 rounded">
            ENDO
          </span>
        )}
        {hasProsthesis && (
          <span className="px-1 py-0.2 text-[8px] font-bold bg-indigo-100 text-indigo-700 rounded">
            PROS
          </span>
        )}
        {hasOther && (
          <span className="px-1 py-0.2 text-[8px] font-bold bg-slate-100 text-slate-700 rounded">
            OTRO
          </span>
        )}
      </div>

      {/* Bottom Number for Lower Teeth */}
      {!isUpper && (
        <span
          className={`text-xs font-bold mt-1 ${
            isFastCaptureActive && isSelected
              ? 'text-indigo-800 font-extrabold'
              : isSelected
              ? 'text-blue-700'
              : 'text-slate-700'
          }`}
        >
          {toothNumber}
        </span>
      )}
    </button>
  );
};
