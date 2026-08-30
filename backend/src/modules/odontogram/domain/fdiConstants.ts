export const ANTERIOR_TEETH: ReadonlySet<number> = new Set([
  11, 12, 13,
  21, 22, 23,
  31, 32, 33,
  41, 42, 43
]);

export const POSTERIOR_TEETH: ReadonlySet<number> = new Set([
  14, 15, 16, 17, 18,
  24, 25, 26, 27, 28,
  34, 35, 36, 37, 38,
  44, 45, 46, 47, 48
]);

export const PERMANENT_FDI_TEETH: ReadonlySet<number> = new Set([
  ...ANTERIOR_TEETH,
  ...POSTERIOR_TEETH
]);

export const QUADRANT_1_TEETH: number[] = [18, 17, 16, 15, 14, 13, 12, 11];
export const QUADRANT_2_TEETH: number[] = [21, 22, 23, 24, 25, 26, 27, 28];
export const QUADRANT_3_TEETH: number[] = [31, 32, 33, 34, 35, 36, 37, 38];
export const QUADRANT_4_TEETH: number[] = [48, 47, 46, 45, 44, 43, 42, 41];

export const FDI_TOOTH_NAMES: Record<number, string> = {
  18: 'Tercer Molar Superior Derecho',
  17: 'Segundo Molar Superior Derecho',
  16: 'Primer Molar Superior Derecho',
  15: 'Segundo Premolar Superior Derecho',
  14: 'Primer Premolar Superior Derecho',
  13: 'Canino Superior Derecho',
  12: 'Incisivo Lateral Superior Derecho',
  11: 'Incisivo Central Superior Derecho',

  21: 'Incisivo Central Superior Izquierdo',
  22: 'Incisivo Lateral Superior Izquierdo',
  23: 'Canino Superior Izquierdo',
  24: 'Primer Premolar Superior Izquierdo',
  25: 'Segundo Premolar Superior Izquierdo',
  26: 'Primer Molar Superior Izquierdo',
  27: 'Segundo Molar Superior Izquierdo',
  28: 'Tercer Molar Superior Izquierdo',

  31: 'Incisivo Central Inferior Izquierdo',
  32: 'Incisivo Lateral Inferior Izquierdo',
  33: 'Canino Inferior Izquierdo',
  34: 'Primer Premolar Inferior Izquierdo',
  35: 'Segundo Premolar Inferior Izquierdo',
  36: 'Primer Molar Inferior Izquierdo',
  37: 'Segundo Molar Inferior Izquierdo',
  38: 'Tercer Molar Inferior Izquierdo',

  41: 'Incisivo Central Inferior Derecho',
  42: 'Incisivo Lateral Inferior Derecho',
  43: 'Canino Inferior Derecho',
  44: 'Primer Premolar Inferior Derecho',
  45: 'Segundo Premolar Inferior Derecho',
  46: 'Primer Molar Inferior Derecho',
  47: 'Segundo Molar Inferior Derecho',
  48: 'Tercer Molar Inferior Derecho'
};

export function isValidPermanentFdiTooth(toothNumber: number): boolean {
  return PERMANENT_FDI_TEETH.has(toothNumber);
}

export function isAnteriorTooth(toothNumber: number): boolean {
  return ANTERIOR_TEETH.has(toothNumber);
}

export function isPosteriorTooth(toothNumber: number): boolean {
  return POSTERIOR_TEETH.has(toothNumber);
}
