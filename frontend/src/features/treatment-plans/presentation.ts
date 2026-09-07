import type { ToothSurface } from '../odontogram/types';
export const fieldClass = 'w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white';
export const buttonClass = 'px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50';
export const surfaceLabels: Record<ToothSurface, string> = { WHOLE_TOOTH: 'Pieza completa', MESIAL: 'Mesial', DISTAL: 'Distal', VESTIBULAR: 'Vestibular', LINGUAL_PALATAL: 'Lingual / palatina', OCCLUSAL: 'Oclusal', INCISAL: 'Incisal' };
