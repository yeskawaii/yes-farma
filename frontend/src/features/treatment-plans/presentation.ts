import type { ToothSurface } from '../odontogram/types';
const controlClass = 'min-h-11 px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed';
export const fieldClass = 'w-full min-w-0 min-h-11 border border-slate-300 rounded-lg p-2.5 text-base bg-white focus-visible:outline-2 focus-visible:outline-blue-600 disabled:bg-slate-100';
export const buttonClass = `${controlClass} bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600`;
export const secondaryButtonClass = `${controlClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`;
export const dangerButtonClass = `${controlClass} border border-red-300 bg-red-50 text-red-700 hover:bg-red-100`;
export const surfaceLabels: Record<ToothSurface, string> = { WHOLE_TOOTH: 'Pieza completa', MESIAL: 'Mesial', DISTAL: 'Distal', VESTIBULAR: 'Vestibular', LINGUAL_PALATAL: 'Lingual / palatina', OCCLUSAL: 'Oclusal', INCISAL: 'Incisal' };
