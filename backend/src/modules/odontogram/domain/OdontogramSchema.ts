import { z } from 'zod';
import { createHash } from 'node:crypto';
import { isAnteriorTooth, isPosteriorTooth, isValidPermanentFdiTooth } from './fdiConstants';

export const dentalFindingTypeSchema = z.enum([
  'CARIES',
  'RESTORATION',
  'CROWN',
  'ENDODONTIC_TREATMENT',
  'IMPLANT',
  'MISSING',
  'FRACTURE',
  'EXTRACTION_INDICATED',
  'PROSTHESIS',
  'OTHER'
]);

export const WHOLE_TOOTH_ONLY_FINDING_TYPES = [
  'CROWN',
  'ENDODONTIC_TREATMENT',
  'IMPLANT',
  'MISSING',
  'EXTRACTION_INDICATED',
  'PROSTHESIS'
] as const;

export const SURFACE_ORIENTED_FINDING_TYPES = [
  'CARIES',
  'RESTORATION',
  'FRACTURE'
] as const;

export const INCOMPATIBLE_WITH_HEALTHY = [
  'CARIES',
  'FRACTURE',
  'EXTRACTION_INDICATED',
  'MISSING',
  'OTHER'
] as const;

export const COMPATIBLE_WITH_HEALTHY = [
  'RESTORATION',
  'CROWN',
  'ENDODONTIC_TREATMENT',
  'IMPLANT',
  'PROSTHESIS'
] as const;

export const INCOMPATIBLE_WITH_MISSING = [
  'CARIES',
  'RESTORATION',
  'FRACTURE',
  'ENDODONTIC_TREATMENT',
  'EXTRACTION_INDICATED'
] as const;

export const toothSurfaceSchema = z.enum([
  'MESIAL',
  'DISTAL',
  'VESTIBULAR',
  'LINGUAL_PALATAL',
  'OCCLUSAL',
  'INCISAL',
  'WHOLE_TOOTH'
]);

export const dentalFindingStatusSchema = z.enum([
  'ACTIVE',
  'RESOLVED',
  'CANCELLED'
]);

export const toothAssessmentTypeSchema = z.enum([
  'HEALTHY'
]);

export const createDentalFindingSchema = z.object({
  toothNumber: z.coerce
    .number()
    .int()
    .refine((val) => isValidPermanentFdiTooth(val), {
      message: 'toothNumber debe ser una pieza dental permanente válida de 2 dígitos según nomenclatura FDI (11-18, 21-28, 31-38, 41-48)'
    }),
  findingType: dentalFindingTypeSchema,
  surfaces: z
    .array(toothSurfaceSchema)
    .min(1, 'Debe especificar al menos una superficie o WHOLE_TOOTH')
    .refine((surfaces) => new Set(surfaces).size === surfaces.length, {
      message: 'No se permiten superficies duplicadas en el mismo hallazgo'
    })
    .refine(
      (surfaces) => {
        if (surfaces.includes('WHOLE_TOOTH')) {
          return surfaces.length === 1;
        }
        return true;
      },
      {
        message: 'WHOLE_TOOTH es mutuamente excluyente con superficies individuales'
      }
    ),
  notes: z.string().trim().max(2000, 'Las notas no pueden exceder 2000 caracteres').optional().nullable().or(z.literal('')),
  encounterId: z.string().uuid('encounterId debe ser un UUID válido').optional().nullable().or(z.literal(''))
}).superRefine((data, ctx) => {
  if (WHOLE_TOOTH_ONLY_FINDING_TYPES.includes(data.findingType as any)) {
    if (data.surfaces.length !== 1 || data.surfaces[0] !== 'WHOLE_TOOTH') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['surfaces'],
        message: `Los hallazgos de tipo ${data.findingType} deben aplicarse a la pieza completa (WHOLE_TOOTH)`
      });
    }
  }

  if (isAnteriorTooth(data.toothNumber) && data.surfaces.includes('OCCLUSAL')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['surfaces'],
      message: 'La superficie OCCLUSAL no es válida para piezas dentales anteriores (incisivos y caninos)'
    });
  }

  if (isPosteriorTooth(data.toothNumber) && data.surfaces.includes('INCISAL')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['surfaces'],
      message: 'La superficie INCISAL no es válida para piezas dentales posteriores (premolares y molares)'
    });
  }
});

export const resolveDentalFindingSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1, 'expectedVersion es requerido y debe ser >= 1'),
  resolutionNotes: z.string().trim().max(2000, 'Las notas de resolución no pueden exceder 2000 caracteres').optional().nullable().or(z.literal('')),
  resolutionEncounterId: z.string().uuid('resolutionEncounterId debe ser un UUID válido').optional().nullable().or(z.literal(''))
});

export const cancelDentalFindingSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1, 'expectedVersion es requerido y debe ser >= 1'),
  cancellationReason: z.string().trim().min(1, 'El motivo de cancelación es obligatorio').max(500, 'El motivo de cancelación no puede exceder 500 caracteres')
});

export const batchFindingItemSchema = z.object({
  toothNumber: z.coerce.number().int().refine((val) => isValidPermanentFdiTooth(val), {
    message: 'toothNumber debe ser una pieza dental permanente válida de 2 dígitos según nomenclatura FDI (11-18, 21-28, 31-38, 41-48)'
  }),
  surfaces: z
    .array(toothSurfaceSchema)
    .min(1, 'Debe especificar al menos una superficie o WHOLE_TOOTH')
    .refine((surfaces) => new Set(surfaces).size === surfaces.length, {
      message: 'No se permiten superficies duplicadas en el mismo hallazgo'
    })
    .refine(
      (surfaces) => {
        if (surfaces.includes('WHOLE_TOOTH')) {
          return surfaces.length === 1;
        }
        return true;
      },
      {
        message: 'WHOLE_TOOTH es mutuamente excluyente con superficies individuales'
      }
    )
});

export const batchAssessmentItemSchema = z.object({
  toothNumber: z.coerce.number().int().refine((val) => isValidPermanentFdiTooth(val), {
    message: 'toothNumber debe ser una pieza dental permanente válida de 2 dígitos según nomenclatura FDI (11-18, 21-28, 31-38, 41-48)'
  })
});

const createFindingBatchSchema = z.object({
  requestId: z.string().uuid('requestId debe ser un UUID válido'),
  action: z.literal('CREATE_FINDING'),
  encounterId: z.string().uuid('encounterId debe ser un UUID válido').optional().nullable().or(z.literal('')),
  findingType: dentalFindingTypeSchema,
  notes: z.string().trim().max(2000, 'Las notas no pueden exceder 2000 caracteres').optional().nullable().or(z.literal('')),
  items: z
    .array(batchFindingItemSchema)
    .min(1, 'El lote debe contener al menos una pieza dental')
    .max(32, 'El lote no puede exceder 32 piezas dentales')
    .refine((items) => new Set(items.map((i) => i.toothNumber)).size === items.length, {
      message: 'No se permiten piezas dentales duplicadas en el mismo lote'
    })
});

const recordAssessmentBatchSchema = z.object({
  requestId: z.string().uuid('requestId debe ser un UUID válido'),
  action: z.literal('RECORD_ASSESSMENT'),
  encounterId: z.string().uuid('encounterId debe ser un UUID válido').optional().nullable().or(z.literal('')),
  assessmentType: toothAssessmentTypeSchema,
  notes: z.string().trim().max(2000, 'Las notas no pueden exceder 2000 caracteres').optional().nullable().or(z.literal('')),
  items: z
    .array(batchAssessmentItemSchema)
    .min(1, 'El lote debe contener al menos una pieza dental')
    .max(32, 'El lote no puede exceder 32 piezas dentales')
    .refine((items) => new Set(items.map((i) => i.toothNumber)).size === items.length, {
      message: 'No se permiten piezas dentales duplicadas en el mismo lote'
    })
});

export const batchOdontogramActionSchema = z
  .discriminatedUnion('action', [createFindingBatchSchema, recordAssessmentBatchSchema])
  .superRefine((data, ctx) => {
    if (data.action === 'CREATE_FINDING') {
      data.items.forEach((item, index) => {
        if (WHOLE_TOOTH_ONLY_FINDING_TYPES.includes(data.findingType as any)) {
          if (item.surfaces.length !== 1 || item.surfaces[0] !== 'WHOLE_TOOTH') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['items', index, 'surfaces'],
              message: `Los hallazgos de tipo ${data.findingType} deben aplicarse a la pieza completa (WHOLE_TOOTH)`
            });
          }
        }

        if (isAnteriorTooth(item.toothNumber) && item.surfaces.includes('OCCLUSAL')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'surfaces'],
            message: `La superficie OCCLUSAL no es válida para la pieza anterior ${item.toothNumber}`
          });
        }

        if (isPosteriorTooth(item.toothNumber) && item.surfaces.includes('INCISAL')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'surfaces'],
            message: `La superficie INCISAL no es válida para la pieza posterior ${item.toothNumber}`
          });
        }
      });
    }
  });

export function areSurfaceSetsEqual(surfacesA: string[], surfacesB: string[]): boolean {
  if (surfacesA.length !== surfacesB.length) return false;
  const sortedA = [...surfacesA].sort();
  const sortedB = [...surfacesB].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

export interface FindingConflictEvaluation {
  conflictCode: 'DENTAL_FINDING_INCOMPATIBLE' | 'DENTAL_FINDING_ALREADY_EXISTS';
  message: string;
}

export function evaluateActiveFindingConflicts(
  toothNumber: number,
  candidateType: DentalFindingType,
  candidateSurfaces: ToothSurface[],
  activeFindingsOnTooth: Array<{ findingType: string; surfaces: string[] }>
): FindingConflictEvaluation | null {
  const hasActiveMissing = activeFindingsOnTooth.some((f) => f.findingType === 'MISSING');

  if (hasActiveMissing && (INCOMPATIBLE_WITH_MISSING as readonly string[]).includes(candidateType)) {
    return {
      conflictCode: 'DENTAL_FINDING_INCOMPATIBLE',
      message: `No se puede registrar un hallazgo de tipo ${candidateType} en una pieza marcada como ausente (MISSING)`
    };
  }

  if (candidateType === 'MISSING') {
    const hasIncompatible = activeFindingsOnTooth.some((f) =>
      (INCOMPATIBLE_WITH_MISSING as readonly string[]).includes(f.findingType as any)
    );
    if (hasIncompatible) {
      return {
        conflictCode: 'DENTAL_FINDING_INCOMPATIBLE',
        message: 'No se puede marcar la pieza como ausente (MISSING) mientras existan hallazgos activos incompatibles (caries, restauración, fractura, endodoncia o extracción indicada)'
      };
    }
  }

  const isDuplicate = activeFindingsOnTooth.some((existing) => {
    if (existing.findingType !== candidateType) return false;
    return areSurfaceSetsEqual(existing.surfaces, candidateSurfaces);
  });

  if (isDuplicate) {
    return {
      conflictCode: 'DENTAL_FINDING_ALREADY_EXISTS',
      message: `Ya existe un hallazgo activo de tipo ${candidateType} en la pieza ${toothNumber} con las mismas superficies`
    };
  }

  return null;
}

export function evaluateActiveAssessmentConflicts(
  toothNumber: number,
  candidateType: ToothAssessmentType,
  activeFindingsOnTooth: Array<{ findingType: string; surfaces: string[] }>
): FindingConflictEvaluation | null {
  if (candidateType === 'HEALTHY') {
    const incompatible = activeFindingsOnTooth.find((f) =>
      (INCOMPATIBLE_WITH_HEALTHY as readonly string[]).includes(f.findingType as any)
    );
    if (incompatible) {
      return {
        conflictCode: 'DENTAL_FINDING_INCOMPATIBLE',
        message: `No se puede evaluar la pieza ${toothNumber} como sana (HEALTHY) porque tiene un hallazgo activo incompatible (${incompatible.findingType})`
      };
    }
  }
  return null;
}

export function computeOdontogramBatchFingerprint(input: BatchOdontogramActionInput): string {
  const normalizedAction = input.action;
  const normalizedEncounterId = input.encounterId && input.encounterId.trim() !== '' ? input.encounterId.trim() : null;
  const normalizedNotes = input.notes && input.notes.trim() !== '' ? input.notes.trim() : null;

  let canonicalData: Record<string, unknown>;

  if (input.action === 'CREATE_FINDING') {
    const sortedItems = [...input.items]
      .map((item) => ({
        surfaces: [...item.surfaces].sort(),
        toothNumber: item.toothNumber
      }))
      .sort((a, b) => a.toothNumber - b.toothNumber);

    canonicalData = {
      action: normalizedAction,
      encounterId: normalizedEncounterId,
      findingType: input.findingType,
      items: sortedItems,
      notes: normalizedNotes
    };
  } else {
    const sortedItems = [...input.items]
      .map((item) => ({
        toothNumber: item.toothNumber
      }))
      .sort((a, b) => a.toothNumber - b.toothNumber);

    canonicalData = {
      action: normalizedAction,
      assessmentType: input.assessmentType,
      encounterId: normalizedEncounterId,
      items: sortedItems,
      notes: normalizedNotes
    };
  }

  const jsonString = JSON.stringify(canonicalData);
  return createHash('sha256').update(jsonString).digest('hex');
}

export type CreateDentalFindingInput = z.infer<typeof createDentalFindingSchema>;
export type ResolveDentalFindingInput = z.infer<typeof resolveDentalFindingSchema>;
export type CancelDentalFindingInput = z.infer<typeof cancelDentalFindingSchema>;
export type BatchFindingItemInput = z.infer<typeof batchFindingItemSchema>;
export type BatchAssessmentItemInput = z.infer<typeof batchAssessmentItemSchema>;
export type BatchOdontogramActionInput = z.infer<typeof batchOdontogramActionSchema>;
export type DentalFindingType = z.infer<typeof dentalFindingTypeSchema>;
export type ToothSurface = z.infer<typeof toothSurfaceSchema>;
export type DentalFindingStatus = z.infer<typeof dentalFindingStatusSchema>;
export type ToothAssessmentType = z.infer<typeof toothAssessmentTypeSchema>;
