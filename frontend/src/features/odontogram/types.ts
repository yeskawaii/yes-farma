export type DentalFindingType =
  | 'CARIES'
  | 'RESTORATION'
  | 'CROWN'
  | 'ENDODONTIC_TREATMENT'
  | 'IMPLANT'
  | 'MISSING'
  | 'FRACTURE'
  | 'EXTRACTION_INDICATED'
  | 'PROSTHESIS'
  | 'OTHER';

export type ToothSurface =
  | 'MESIAL'
  | 'DISTAL'
  | 'VESTIBULAR'
  | 'LINGUAL_PALATAL'
  | 'OCCLUSAL'
  | 'INCISAL'
  | 'WHOLE_TOOTH';

export type DentalFindingStatus = 'ACTIVE' | 'RESOLVED' | 'CANCELLED';

export interface DentalFindingItem {
  id: string;
  toothNumber?: number;
  findingType: DentalFindingType;
  surfaces: ToothSurface[];
  status: DentalFindingStatus;
  version: number;
  notes: string | null;
  encounterId: string | null;
  resolutionEncounterId?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    role: string;
    name: string;
  };
  resolvedBy?: {
    id: string;
    role: string;
    name: string;
  } | null;
  cancelledBy?: {
    id: string;
    role: string;
    name: string;
  } | null;
}

export interface OdontogramSummary {
  totalActiveFindings: number;
  teethWithActiveFindings: number;
  missingTeethCount: number;
}

export interface ToothSummaryEntry {
  toothNumber: number;
  toothName: string;
  activeFindings: DentalFindingItem[];
}

export interface OdontogramResponse {
  patientId: string;
  summary: OdontogramSummary;
  teeth: Record<number, ToothSummaryEntry>;
}

export interface ToothDetailResponse {
  patientId: string;
  toothNumber: number;
  toothName: string;
  activeFindings: DentalFindingItem[];
  resolvedFindings: DentalFindingItem[];
  cancelledFindings: DentalFindingItem[];
  history: DentalFindingItem[];
}

export interface CreateDentalFindingInput {
  toothNumber: number;
  findingType: DentalFindingType;
  surfaces: ToothSurface[];
  notes?: string | null;
  encounterId?: string | null;
}

export interface ResolveDentalFindingInput {
  expectedVersion: number;
  resolutionNotes?: string | null;
  resolutionEncounterId?: string | null;
}

export interface CancelDentalFindingInput {
  expectedVersion: number;
  cancellationReason: string;
}

export const FDI_TOOTH_NAMES: Record<number, string> = {
  // Cuadrante 1: Superior Derecho (18..11)
  18: 'Tercer Molar Superior Derecho',
  17: 'Segundo Molar Superior Derecho',
  16: 'Primer Molar Superior Derecho',
  15: 'Segundo Premolar Superior Derecho',
  14: 'Primer Premolar Superior Derecho',
  13: 'Canino Superior Derecho',
  12: 'Incisivo Lateral Superior Derecho',
  11: 'Incisivo Central Superior Derecho',

  // Cuadrante 2: Superior Izquierdo (21..28)
  21: 'Incisivo Central Superior Izquierdo',
  22: 'Incisivo Lateral Superior Izquierdo',
  23: 'Canino Superior Izquierdo',
  24: 'Primer Premolar Superior Izquierdo',
  25: 'Segundo Premolar Superior Izquierdo',
  26: 'Primer Molar Superior Izquierdo',
  27: 'Segundo Molar Superior Izquierdo',
  28: 'Tercer Molar Superior Izquierdo',

  // Cuadrante 3: Inferior Izquierdo (31..38)
  31: 'Incisivo Central Inferior Izquierdo',
  32: 'Incisivo Lateral Inferior Izquierdo',
  33: 'Canino Inferior Izquierdo',
  34: 'Primer Premolar Inferior Izquierdo',
  35: 'Segundo Premolar Inferior Izquierdo',
  36: 'Primer Molar Inferior Izquierdo',
  37: 'Segundo Molar Inferior Izquierdo',
  38: 'Tercer Molar Inferior Izquierdo',

  // Cuadrante 4: Inferior Derecho (48..41)
  41: 'Incisivo Central Inferior Derecho',
  42: 'Incisivo Lateral Inferior Derecho',
  43: 'Canino Inferior Derecho',
  44: 'Primer Premolar Inferior Derecho',
  45: 'Segundo Premolar Inferior Derecho',
  46: 'Primer Molar Inferior Derecho',
  47: 'Segundo Molar Inferior Derecho',
  48: 'Tercer Molar Inferior Derecho'
};
