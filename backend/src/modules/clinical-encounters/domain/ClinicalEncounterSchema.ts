import { z } from 'zod';

const isoWithTimezonePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

const isValidIsoStringWithOffsetOrZ = (value: string): boolean => {
  const match = isoWithTimezonePattern.exec(value);

  if (!match) {
    return false;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    timezoneText,
    ,
    offsetHourText,
    offsetMinuteText
  ] = match;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }

  const leapYear =
    year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);

  const daysPerMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  const maximumDay = daysPerMonth[month - 1];

  if (maximumDay === undefined || day < 1 || day > maximumDay) {
    return false;
  }

  if (timezoneText !== 'Z') {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);

    if (
      offsetHour < 0 ||
      offsetHour > 14 ||
      offsetMinute < 0 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      return false;
    }
  }

  return Number.isFinite(new Date(value).getTime());
};

const isoStringWithOffsetOrZ = z.string().refine(
  isValidIsoStringWithOffsetOrZ,
  {
    message:
      'Invalid ISO 8601 string. Must include Z or explicit offset and be a valid date.'
  }
);

export const createClinicalEncounterSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  appointmentId: z
    .string()
    .uuid('appointmentId must be a valid UUID')
    .optional(),
  occurredAt: isoStringWithOffsetOrZ
}).strict();

export const listClinicalEncountersSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(50).optional().default(20)
});

const emptyStringToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === ''
    ? null
    : value;

const narrativeField = (maximumLength: number) =>
  z.preprocess(
    emptyStringToNull,
    z.string().trim().max(maximumLength).nullable().optional()
  );

const vitalSignsSchema = z.object({
  systolicBloodPressure: z.number().int().min(30).max(300).nullable().optional(),
  diastolicBloodPressure: z.number().int().min(20).max(200).nullable().optional(),
  heartRate: z.number().int().min(20).max(300).nullable().optional(),
  respiratoryRate: z.number().int().min(5).max(80).nullable().optional(),
  temperatureCelsius: z.number().min(25).max(45).nullable().optional(),
  oxygenSaturationPercent: z.number().int().min(0).max(100).nullable().optional(),
  weightKg: z.number().min(0.5).max(500).nullable().optional(),
  heightCm: z.number().int().min(20).max(300).nullable().optional(),
  measuredAt: isoStringWithOffsetOrZ.optional()
})
  .strict()
  .refine(
    (data) => {
      if (
        data.systolicBloodPressure !== null &&
        data.systolicBloodPressure !== undefined &&
        data.diastolicBloodPressure !== null &&
        data.diastolicBloodPressure !== undefined
      ) {
        return (
          data.systolicBloodPressure >
          data.diastolicBloodPressure
        );
      }

      return true;
    },
    {
      message: 'Systolic must be greater than diastolic'
    }
  )
  .refine(
    (data) =>
      data.systolicBloodPressure != null ||
      data.diastolicBloodPressure != null ||
      data.heartRate != null ||
      data.respiratoryRate != null ||
      data.temperatureCelsius != null ||
      data.oxygenSaturationPercent != null ||
      data.weightKg != null ||
      data.heightCm != null,
    {
      message: 'At least one clinical value must be provided'
    }
  );

const diagnosisSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  code: z.string().trim().max(64).nullable().optional(),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional()
}).strict();

const procedureSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  code: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional()
}).strict();

export const updateClinicalEncounterSchema = z.object({
  version: z.number().int().min(1, 'version must be >= 1'),
  occurredAt: isoStringWithOffsetOrZ.optional(),

  reasonForVisit: narrativeField(5000),
  relevantHistory: narrativeField(10000),
  allergies: narrativeField(5000),
  currentMedications: narrativeField(5000),
  physicalExamination: narrativeField(10000),
  indications: narrativeField(10000),
  clinicalNotes: narrativeField(10000),

  vitalSigns: vitalSignsSchema.nullable().optional(),

  diagnoses: z
    .array(diagnosisSchema)
    .max(50)
    .refine(
      (diagnoses) =>
        diagnoses.filter((diagnosis) => diagnosis.isPrimary).length <= 1,
      {
        message: 'Only one primary diagnosis is allowed'
      }
    )
    .optional(),

  procedures: z.array(procedureSchema).max(50).optional()
})
  .strict()
  .superRefine((data, context) => {
    const mutationFields = Object.keys(data).filter(
      (field) => field !== 'version'
    );

    if (mutationFields.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Body must contain at least one mutation besides version'
      });
    }
  });

export type CreateClinicalEncounterInput =
  z.infer<typeof createClinicalEncounterSchema>;

export type ListClinicalEncountersInput =
  z.infer<typeof listClinicalEncountersSchema>;

export type UpdateClinicalEncounterInput =
  z.infer<typeof updateClinicalEncounterSchema>;

export const finalizeClinicalEncounterSchema = z.object({
  version: z.number().int().min(1, 'version must be >= 1')
}).strict();

export type FinalizeClinicalEncounterInput =
  z.infer<typeof finalizeClinicalEncounterSchema>;
