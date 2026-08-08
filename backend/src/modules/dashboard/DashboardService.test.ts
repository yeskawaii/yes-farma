import test from 'node:test';
import assert from 'node:assert';
import { DashboardService, IDashboardRepository } from './application/DashboardService';
import { AppError } from '../../shared/errors/AppError';
import { getStartOfDay, getStartOfWeek, addCalendarDays } from '../../shared/utils/timezone';
import type { Prisma, PrismaClient } from '../../generated/prisma';

// Mock generator for repository
const createFakeRepo = (overrides: Partial<IDashboardRepository> = {}): IDashboardRepository => {
  return {
    clinic: {
      findUnique: async () => ({ timeZone: 'America/Mexico_City' }),
    } as unknown as PrismaClient['clinic'],
    appointment: {
      findMany: async () => [],
    } as unknown as PrismaClient['appointment'],
    patient: {
      count: async () => 0,
    } as unknown as PrismaClient['patient'],
    clinicalEncounter: {
      count: async () => 0,
    } as unknown as PrismaClient['clinicalEncounter'],
    ...overrides
  };
};

test('1. PROFESSIONAL obtiene scope PERSONAL. 4. OWNER obtiene scope CLINIC. 6. ASSISTANT obtiene scope CLINIC_ADMIN.', async () => {
  const repo = createFakeRepo();
  const service = new DashboardService(repo);

  const resProf = await service.getDashboard('c-1', 'm-1', 'PROFESSIONAL');
  assert.strictEqual(resProf.scope, 'PERSONAL');
  assert.strictEqual(resProf.timeZone, 'America/Mexico_City');

  const resOwner = await service.getDashboard('c-1', 'm-1', 'OWNER');
  assert.strictEqual(resOwner.scope, 'CLINIC');
  assert.strictEqual(resOwner.timeZone, 'America/Mexico_City');

  const resAdmin = await service.getDashboard('c-1', 'm-1', 'ASSISTANT');
  assert.strictEqual(resAdmin.scope, 'CLINIC_ADMIN');
});

test('9. rol desconocido -> 403.', async () => {
  const repo = createFakeRepo();
  const service = new DashboardService(repo);
  await assert.rejects(
    () => service.getDashboard('c-1', 'm-1', 'UNKNOWN'),
    (err: unknown) => err instanceof AppError && err.statusCode === 403
  );
});

test('2. PROFESSIONAL filtra appointments por su membership. 3. PROFESSIONAL no ve citas de otro profesional.', async () => {
  const capturedArgs: Prisma.AppointmentFindManyArgs[] = [];
  const repo = createFakeRepo({
    appointment: {
      findMany: async (args: Prisma.AppointmentFindManyArgs) => {
        capturedArgs.push(args);
        return [];
      }
    } as unknown as PrismaClient['appointment']
  });
  const service = new DashboardService(repo);
  await service.getDashboard('c-1', 'my-mem', 'PROFESSIONAL');

  assert.ok(capturedArgs[0]);
  const firstArgs = capturedArgs[0];
  assert.strictEqual(firstArgs.where?.professionalMembershipId, 'my-mem');
});

test('E. UPCOMING PROFESSIONAL SECURITY: Confirmar que LAS DOS queries de appointment para PROFESSIONAL contienen professionalMembershipId', async () => {
  const capturedArgs: Prisma.AppointmentFindManyArgs[] = [];
  const repo = createFakeRepo({
    appointment: {
      findMany: async (args: Prisma.AppointmentFindManyArgs) => {
        capturedArgs.push(args);
        // First query returns mock items, second query would use them
        if (capturedArgs.length === 1) {
          return [
            { id: '1', startAt: new Date('2026-08-08T13:00:00Z'), endAt: new Date('2026-08-08T14:00:00Z'), status: 'SCHEDULED', patientId: 'p1' }
          ];
        }
        return [];
      }
    } as unknown as PrismaClient['appointment']
  });
  const clock = () => new Date('2026-08-08T12:00:00Z');
  const service = new DashboardService(repo, clock);
  await service.getDashboard('c-1', 'my-mem', 'PROFESSIONAL');

  assert.strictEqual(capturedArgs.length, 2);
  const firstArgs = capturedArgs[0];
  const secondArgs = capturedArgs[1];

  assert.ok(firstArgs);
  assert.ok(secondArgs);
  assert.strictEqual(firstArgs.where?.professionalMembershipId, 'my-mem');
  assert.strictEqual(secondArgs.where?.professionalMembershipId, 'my-mem');
});

test('F. CONSISTENCIA EVENTUAL: Simular que un upcoming ID obtenido en primera query ya no aparece en la segunda query.', async () => {
  const repo = createFakeRepo({
    appointment: {
      findMany: async (args: Prisma.AppointmentFindManyArgs) => {
        const idFilter = args.where?.id;

        if (typeof idFilter === 'object' && idFilter !== null && 'in' in idFilter && Array.isArray(idFilter.in)) {
          // Second query: return empty array (it disappeared)
          return [];
        } else {
          // First query: return an upcoming appointment
          return [
            { id: 'ghost-1', startAt: new Date('2026-08-08T13:00:00Z'), endAt: new Date('2026-08-08T14:00:00Z'), status: 'SCHEDULED', patientId: 'p1' }
          ];
        }
      }
    } as unknown as PrismaClient['appointment']
  });

  const clock = () => new Date('2026-08-08T12:00:00Z');
  const service = new DashboardService(repo, clock);
  const res = await service.getDashboard('c-1', 'm-1', 'OWNER');

  // Should not throw, should be an empty array
  assert.strictEqual(res.upcomingAppointments.length, 0);
});

test('5. OWNER ve clínica completa. 8. ASSISTANT no consulta ClinicalEncounter para construir el dashboard.', async () => {
  const capturedArgs: Prisma.AppointmentFindManyArgs[] = [];
  let encounterCountCalled = false;

  const repo = createFakeRepo({
    appointment: {
      findMany: async (args: Prisma.AppointmentFindManyArgs) => {
        capturedArgs.push(args);
        return [];
      }
    } as unknown as PrismaClient['appointment'],
    clinicalEncounter: {
      count: async () => {
        encounterCountCalled = true;
        return 0;
      }
    } as unknown as PrismaClient['clinicalEncounter']
  });

  const serviceOwner = new DashboardService(repo);
  await serviceOwner.getDashboard('c-1', 'm-1', 'OWNER');
  assert.ok(capturedArgs[0]);
  const firstArgs = capturedArgs[0];
  assert.strictEqual(firstArgs.where?.professionalMembershipId, undefined);

  const serviceAssistant = new DashboardService(repo);
  const resAdmin = await serviceAssistant.getDashboard('c-1', 'm-1', 'ASSISTANT');
  assert.strictEqual(encounterCountCalled, false);
  assert.strictEqual('pending' in resAdmin, false);
});

test('10-17, 24-29: Appointments counting correctly for today and scheduledMinutes', async () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const clock = () => now;

  const repo = createFakeRepo({
    appointment: {
      findMany: async (args: Prisma.AppointmentFindManyArgs) => {
        const idFilter = args.where?.id;
        if (typeof idFilter === 'object' && idFilter !== null && 'in' in idFilter && Array.isArray(idFilter.in)) {
           return idFilter.in.map((id: string) => ({
             id,
             startAt: new Date('2026-08-08T13:00:00Z'),
             endAt: new Date('2026-08-08T14:00:00Z'),
             status: 'SCHEDULED',
             patient: { id: 'p-1', firstName: 'A', lastName: 'B' },
             professional: { id: 'm-1', user: { firstName: 'C', lastName: 'D' } }
           }));
        }
        return [
          { id: '1', startAt: new Date('2026-08-08T13:00:00Z'), endAt: new Date('2026-08-08T14:00:00Z'), status: 'SCHEDULED', patientId: 'p-1' },
          { id: '2', startAt: new Date('2026-08-08T14:00:00Z'), endAt: new Date('2026-08-08T14:30:00Z'), status: 'CONFIRMED', patientId: 'p-2' },
          { id: '3', startAt: new Date('2026-08-08T08:00:00Z'), endAt: new Date('2026-08-08T09:00:00Z'), status: 'SCHEDULED', patientId: 'p-1' },
          { id: '4', startAt: new Date('2026-08-08T15:00:00Z'), endAt: new Date('2026-08-08T16:00:00Z'), status: 'IN_PROGRESS', patientId: 'p-3' },
          { id: '5', startAt: new Date('2026-08-08T16:00:00Z'), endAt: new Date('2026-08-08T17:00:00Z'), status: 'COMPLETED', patientId: 'p-1' },
          { id: '6', startAt: new Date('2026-08-08T17:00:00Z'), endAt: new Date('2026-08-08T18:00:00Z'), status: 'CANCELLED', patientId: 'p-4' },
          { id: '7', startAt: new Date('2026-08-08T18:00:00Z'), endAt: new Date('2026-08-08T19:00:00Z'), status: 'NO_SHOW', patientId: 'p-5' },
        ];
      }
    } as unknown as PrismaClient['appointment']
  });

  const service = new DashboardService(repo, clock);
  const res = await service.getDashboard('c-1', 'm-1', 'OWNER');

  assert.strictEqual(res.today.appointmentsTotal, 7);
  assert.strictEqual(res.today.appointmentsUpcoming, 2);
  assert.strictEqual(res.today.appointmentsInProgress, 1);
  assert.strictEqual(res.today.appointmentsCompleted, 1);
  assert.strictEqual(res.today.appointmentsCancelled, 1);
  assert.strictEqual(res.today.appointmentsNoShow, 1);
  assert.strictEqual(res.week.scheduledMinutes, 270);
  assert.strictEqual(res.week.patientsSeen, 1);
});

test('26-31. PROFESSIONAL draftClinicalEncounters y singleDraft logic', async () => {
  const capturedArgsCount: Prisma.ClinicalEncounterCountArgs[] = [];
  const capturedArgsFirst: Prisma.ClinicalEncounterFindFirstArgs[] = [];

  const createMockService = (countResult: number, firstResult: any = null) => {
    const repo = createFakeRepo({
      clinicalEncounter: {
        count: async (args: Prisma.ClinicalEncounterCountArgs) => {
          capturedArgsCount.push(args);
          return countResult;
        },
        findFirst: async (args: Prisma.ClinicalEncounterFindFirstArgs) => {
          capturedArgsFirst.push(args);
          return firstResult;
        }
      } as unknown as PrismaClient['clinicalEncounter']
    });
    return new DashboardService(repo);
  };

  // 26. PROFESSIONAL 0 drafts -> count 0, singleDraft null.
  const service0 = createMockService(0);
  const res0 = await service0.getDashboard('c-1', 'm-1', 'PROFESSIONAL');
  if ('pending' in res0) {
    assert.strictEqual(res0.pending.draftClinicalEncounters, 0);
    assert.strictEqual(res0.pending.singleDraft, null);
  }

  // 27. PROFESSIONAL 1 draft -> singleDraft con encounterId/patientId.
  const service1 = createMockService(1, { id: 'enc-1', patientId: 'pat-1' });
  const res1 = await service1.getDashboard('c-1', 'm-2', 'PROFESSIONAL');
  if ('pending' in res1) {
    assert.strictEqual(res1.pending.draftClinicalEncounters, 1);
    assert.deepStrictEqual(res1.pending.singleDraft, { encounterId: 'enc-1', patientId: 'pat-1' });
  }

  // 28. PROFESSIONAL 2+ drafts -> singleDraft null.
  const service2 = createMockService(2, { id: 'enc-1', patientId: 'pat-1' });
  const res2 = await service2.getDashboard('c-1', 'm-3', 'PROFESSIONAL');
  if ('pending' in res2) {
    assert.strictEqual(res2.pending.draftClinicalEncounters, 2);
    assert.strictEqual(res2.pending.singleDraft, null);
  }

  // Check 29, 30, 31: findFirst usa clinicId, professionalMembershipId, status DRAFT
  const firstArgs = capturedArgsFirst[0];
  assert.ok(firstArgs);
  assert.strictEqual(firstArgs.where?.clinicId, 'c-1');
  assert.strictEqual(firstArgs.where?.professionalMembershipId, 'm-2');
  assert.strictEqual(firstArgs.where?.status, 'DRAFT');
});

test('32-34: OWNER y ASSISTANT obtienen pacientes ACTIVE', async () => {
  const capturedArgs: Prisma.PatientCountArgs[] = [];
  const repo = createFakeRepo({
    patient: {
      count: async (args: Prisma.PatientCountArgs) => {
        capturedArgs.push(args);
        return 99;
      }
    } as unknown as PrismaClient['patient']
  });
  const service = new DashboardService(repo);
  const res = await service.getDashboard('c-1', 'm-1', 'OWNER');

  assert.ok(capturedArgs[0]);
  const firstArgs = capturedArgs[0];
  assert.strictEqual(firstArgs.where?.status, 'ACTIVE');

  if ('patients' in res) {
    assert.strictEqual(res.patients.activeTotal, 99);
  } else {
    assert.fail('Expected Owner dashboard to have patients field');
  }
});

test('A. SPRING FORWARD America/New_York (Diferencia real de 23 horas)', () => {
  const sfMidnight = getStartOfDay(new Date('2026-03-08T12:00:00Z'), 'America/New_York');
  const sfNextDay = addCalendarDays(sfMidnight, 'America/New_York', 1);

  assert.strictEqual(sfMidnight.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.strictEqual(sfNextDay.toISOString(), '2026-03-09T04:00:00.000Z');

  const diffHours = (sfNextDay.getTime() - sfMidnight.getTime()) / (3600 * 1000);
  assert.strictEqual(diffHours, 23);
});

test('B. FALL BACK America/New_York (Diferencia real de 25 horas)', () => {
  const fbMidnight = getStartOfDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York');
  const fbNextDay = addCalendarDays(fbMidnight, 'America/New_York', 1);

  assert.strictEqual(fbMidnight.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.strictEqual(fbNextDay.toISOString(), '2026-11-02T05:00:00.000Z');

  const diffHours = (fbNextDay.getTime() - fbMidnight.getTime()) / (3600 * 1000);
  assert.strictEqual(diffHours, 25);
});

test('C. SEMANA QUE CRUZA DST: weekStart y nextWeekStart son siempre lunes 00:00 LOCAL', () => {
  const testDate = new Date('2026-03-12T12:00:00Z'); // Thursday after spring forward in NY

  const weekStart = getStartOfWeek(testDate, 'America/New_York');
  const nextWeekStart = addCalendarDays(weekStart, 'America/New_York', 7);

  // The week started on Monday March 9
  assert.strictEqual(weekStart.toISOString(), '2026-03-09T04:00:00.000Z');
  // Next week starts on Monday March 16
  assert.strictEqual(nextWeekStart.toISOString(), '2026-03-16T04:00:00.000Z');
});

test('D. BOUNDARY DE HOY', async () => {
  // We use Mexico_City timezone (UTC-6)
  // Local midnight is 06:00:00Z
  const today = new Date('2026-08-08T12:00:00Z'); // 06:00 AM local
  const clock = () => today;

  const repo = createFakeRepo({
    appointment: {
      findMany: async () => [
        // Before midnight (yesterday local time, Aug 7 23:59:59 = Aug 8 05:59:59Z)
        { id: '1', startAt: new Date('2026-08-08T05:59:59Z'), endAt: new Date('2026-08-08T06:30:00Z'), status: 'COMPLETED', patientId: 'p1' },
        // Exactly midnight (today local time, Aug 8 00:00:00 = Aug 8 06:00:00Z)
        { id: '2', startAt: new Date('2026-08-08T06:00:00Z'), endAt: new Date('2026-08-08T06:30:00Z'), status: 'COMPLETED', patientId: 'p2' },
        // After midnight of tomorrow (tomorrow local time, Aug 9 00:00:00 = Aug 9 06:00:00Z)
        { id: '3', startAt: new Date('2026-08-09T06:00:00Z'), endAt: new Date('2026-08-09T06:30:00Z'), status: 'COMPLETED', patientId: 'p3' },
      ]
    } as unknown as PrismaClient['appointment']
  });

  const service = new DashboardService(repo, clock);
  const res = await service.getDashboard('c-1', 'm-1', 'OWNER');

  // Only id 2 belongs to today.
  assert.strictEqual(res.today.appointmentsTotal, 1);
  assert.strictEqual(res.today.appointmentsCompleted, 1);
});
