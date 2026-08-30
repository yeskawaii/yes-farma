import { z } from 'zod';
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
  // Whole-tooth only finding types must have exactly ['WHOLE_TOOTH']
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

export type CreateDentalFindingInput = z.infer<typeof createDentalFindingSchema>;
export type ResolveDentalFindingInput = z.infer<typeof resolveDentalFindingSchema>;
export type CancelDentalFindingInput = z.infer<typeof cancelDentalFindingSchema>;
export type DentalFindingType = z.infer<typeof dentalFindingTypeSchema>;
export type ToothSurface = z.infer<typeof toothSurfaceSchema>;
export type DentalFindingStatus = z.infer<typeof dentalFindingStatusSchema>;
