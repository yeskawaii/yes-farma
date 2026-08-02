import test from 'node:test';
import assert from 'node:assert';
import { PatientService, IPatientRepository } from './application/PatientService';
import { createPatientSchema, updatePatientSchema, listPatientsSchema } from './domain/PatientSchema';
import { AppError } from '../../shared/errors/AppError';
import type { Patient } from '../../generated/prisma';
import { Request, Response, NextFunction } from 'express';
import { requireRoles } from './infrastructure/requireRoles';
import { AuthenticatedRequest } from './infrastructure/PatientController';
import { AuthContext } from '../../middlewares/auth';

const createFakeRepo = (overrides: any = {}): IPatientRepository => {
  return {
    patient: {
      findMany: async () => [],
      findFirst: async () => null,
      count: async () => 0,
    },
    $transaction: async (cb: any) => cb({
      patient: {
        create: async (args: any) => args.data as Patient,
        update: async (args: any) => args.data as Patient,
      },
      auditEvent: {
        create: async (args: any) => args.data,
      }
    }),
    ...overrides
  } as unknown as IPatientRepository;
};

// 1. validación de birthDate válida
test('1. birthDate válida en formato YYYY-MM-DD', () => {
  assert.ok(createPatientSchema.parse({ firstName: 'A', lastName: 'B', birthDate: '1990-05-20' }));
});

// 2. rechazo de fecha inexistente o futura
test('2. rechazo de fecha inexistente o futura', () => {
  assert.throws(() => createPatientSchema.parse({ firstName: 'A', lastName: 'B', birthDate: '2050-01-01' }));
  assert.throws(() => createPatientSchema.parse({ firstName: 'A', lastName: 'B', birthDate: 'invalid' }));
});

// 3. normalización de teléfono y correo
test('3. normalización de teléfono y correo (via service)', async () => {
  let createdData: any = null;
  const repo = createFakeRepo({
    $transaction: async (cb: any) => {
      return cb({
        patient: { create: async (args: any) => { createdData = args.data; return args.data as Patient; } },
        auditEvent: { create: async () => {} }
      });
    }
  });
  const service = new PatientService(repo);
  await service.createPatient('clinic-1', 'mem-1', 'usr-1', {
    firstName: 'A', lastName: 'B', phone: '+52 (55) 1234-5678', email: ' TeSt@email.com '
  });
  assert.strictEqual(createdData.phone, '525512345678');
  assert.strictEqual(createdData.email, 'test@email.com');
});

// 4. rechazo de PATCH vacío
test('4. rechazo de PATCH vacío', () => {
  assert.throws(() => updatePatientSchema.parse({}));
  assert.ok(updatePatientSchema.parse({ firstName: 'New' }));
});

// 5. defaults de paginación
test('5. defaults de paginación', () => {
  const res = listPatientsSchema.parse({});
  assert.strictEqual(res.page, 1);
  assert.strictEqual(res.pageSize, 20);
});

// 6. aceptación de pageSize 50
test('6. aceptación de pageSize 50', () => {
  const res = listPatientsSchema.parse({ pageSize: '50' });
  assert.strictEqual(res.pageSize, 50);
});

// 7. rechazo de pageSize 51
test('7. rechazo de pageSize 51', () => {
  assert.throws(() => listPatientsSchema.parse({ pageSize: '51' }));
});

// 8. body de creación no acepta clinicId
test('8. body de creación no acepta clinicId', () => {
  const input: Record<string, unknown> = { firstName: 'A', lastName: 'B', clinicId: '123' };
  const parsed = createPatientSchema.parse(input);
  assert.strictEqual('clinicId' in parsed, false);
});

// 9. creación utiliza clinicId y membershipId del contexto inyectado
test('9. creación utiliza clinicId y membershipId del contexto inyectado', async () => {
  let createdData: any = null;
  const repo = createFakeRepo({
    $transaction: async (cb: any) => {
      return cb({
        patient: { create: async (args: any) => { createdData = args.data; return args.data as Patient; } },
        auditEvent: { create: async () => {} }
      });
    }
  });
  const service = new PatientService(repo);
  await service.createPatient('context-clinic', 'context-mem', 'usr-1', { firstName: 'A', lastName: 'B' });
  assert.strictEqual(createdData.clinicId, 'context-clinic');
  assert.strictEqual(createdData.createdByMembershipId, 'context-mem');
});

// 10. listado siempre filtra por clinicId
test('10. listado siempre filtra por clinicId', async () => {
  let findManyArgs: any = null;
  const repo = createFakeRepo({
    patient: {
      findMany: async (args: any) => { findManyArgs = args; return []; },
      count: async () => 0,
      findFirst: async () => null,
    }
  });
  const service = new PatientService(repo);
  await service.listPatients('filtered-clinic', listPatientsSchema.parse({}));
  assert.strictEqual(findManyArgs.where.clinicId, 'filtered-clinic');
});

// 11. detalle de otro tenant devuelve 404
test('11. detalle de otro tenant devuelve 404', async () => {
  const repo = createFakeRepo({ 
    patient: { 
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
    } 
  });
  const service = new PatientService(repo);
  await assert.rejects(
    () => service.getPatientById('clinic-1', 'patient-2'),
    (err: any) => err instanceof AppError && err.statusCode === 404
  );
});

// 12. actualización de otro tenant devuelve 404
test('12. actualización de otro tenant devuelve 404', async () => {
  const repo = createFakeRepo({ 
    patient: { 
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
    } 
  });
  const service = new PatientService(repo);
  await assert.rejects(
    () => service.updatePatient('clinic-1', 'patient-2', 'mem-1', 'usr-1', { firstName: 'A' }),
    (err: any) => err instanceof AppError && err.statusCode === 404
  );
});

// 13. detección de posible duplicado
test('13. detección de posible duplicado', async () => {
  const repo = createFakeRepo({
    patient: {
      findMany: async () => [{ firstName: 'Juan', lastName: 'Perez', phone: '123' } as Patient],
      count: async () => 0,
      findFirst: async () => null,
    }
  });
  const service = new PatientService(repo);
  await assert.rejects(
    () => service.createPatient('c-1', 'm-1', 'u-1', { firstName: 'Juan', lastName: 'Perez', phone: '123' }),
    (err: any) => err instanceof AppError && err.statusCode === 409
  );
});

// 14. confirmPossibleDuplicate permite continuar
test('14. confirmPossibleDuplicate permite continuar', async () => {
  const repo = createFakeRepo({
    patient: {
      findMany: async () => { throw new Error('Should not check duplicates'); },
      count: async () => 0,
      findFirst: async () => null,
    }
  });
  const service = new PatientService(repo);
  const res = await service.createPatient('c-1', 'm-1', 'u-1', { 
    firstName: 'Juan', lastName: 'Perez', phone: '123', confirmPossibleDuplicate: true 
  });
  assert.strictEqual(res.firstName, 'Juan');
});

// 18. desactivación idempotente
test('18. desactivación idempotente', async () => {
  let txCalled = false;
  const repo = createFakeRepo({
    patient: { 
      findFirst: async () => ({ status: 'INACTIVE' } as Patient),
      findMany: async () => [],
      count: async () => 0,
    },
    $transaction: async () => { txCalled = true; return {} as any; }
  });
  const service = new PatientService(repo);
  const res = await service.deactivatePatient('c-1', 'p-1', 'm-1', 'u-1');
  assert.strictEqual(res.status, 'INACTIVE');
  assert.strictEqual(txCalled, false);
});

// 19. creación genera AuditEvent
test('19. creación genera AuditEvent', async () => {
  let auditData: any = null;
  const repo = createFakeRepo({
    $transaction: async (cb: any) => {
      return cb({
        patient: { create: async (args: any) => ({ id: 'new-id', ...args.data }) as Patient, update: async (args: any) => args.data as Patient },
        auditEvent: { create: async (args: any) => { auditData = args.data; } }
      });
    }
  });
  const service = new PatientService(repo);
  await service.createPatient('c-1', 'm-1', 'u-1', { firstName: 'A', lastName: 'B' });
  assert.strictEqual(auditData.action, 'PATIENT_CREATED');
});

// 20. actualización genera AuditEvent con nombres de campos modificados
test('20. actualización genera AuditEvent con nombres de campos modificados', async () => {
  let auditData: any = null;
  const repo = createFakeRepo({
    patient: { 
      findFirst: async () => ({ id: 'p-1', firstName: 'Old' } as Patient),
      findMany: async () => [],
      count: async () => 0,
    },
    $transaction: async (cb: any) => cb({
      patient: { update: async (args: any) => args.data as Patient, create: async (args: any) => args.data as Patient },
      auditEvent: { create: async (args: any) => { auditData = args.data; } }
    })
  });
  const service = new PatientService(repo);
  await service.updatePatient('c-1', 'p-1', 'm-1', 'u-1', { firstName: 'New' });
  assert.strictEqual(auditData.action, 'PATIENT_UPDATED');
  assert.ok(auditData.metadata.updatedFields.includes('firstName'));
});

// 21 & 22. desactivación transaccional con AuditEvent
test('21 & 22. desactivación transaccional con AuditEvent', async () => {
  let txCalled = false;
  let auditAction = '';
  const repo = createFakeRepo({
    patient: { 
      findFirst: async () => ({ id: 'p-1', status: 'ACTIVE' } as Patient),
      findMany: async () => [],
      count: async () => 0,
    },
    $transaction: async (cb: any) => {
      txCalled = true;
      return cb({
        patient: { update: async (args: any) => args.data as Patient, create: async (args: any) => args.data as Patient },
        auditEvent: { create: async (args: any) => { auditAction = args.data.action; } }
      });
    }
  });
  const service = new PatientService(repo);
  await service.deactivatePatient('c-1', 'p-1', 'm-1', 'u-1');
  assert.strictEqual(txCalled, true);
  assert.strictEqual(auditAction, 'PATIENT_DEACTIVATED');
});

const createFakeReq = (role?: string): AuthenticatedRequest => ({
  authContext: role ? { role } as AuthContext : undefined
} as unknown as AuthenticatedRequest);

// Pruebas de Autorización (Middlewares)
test('23. ASSISTANT recibe 403 al intentar acceder a la ruta de desactivación', (t) => {
  const middleware = requireRoles(['OWNER', 'PROFESSIONAL']);
  const req = createFakeReq('ASSISTANT');
  let error: any = null;
  middleware(req, {} as Response, (err?: any) => { error = err; });
  assert.ok(error instanceof AppError);
  assert.strictEqual(error.statusCode, 403);
});

test('24. OWNER supera el middleware de autorización para desactivar', (t) => {
  const middleware = requireRoles(['OWNER', 'PROFESSIONAL']);
  const req = createFakeReq('OWNER');
  let called = false;
  middleware(req, {} as Response, (err?: any) => {
    assert.strictEqual(err, undefined);
    called = true;
  });
  assert.strictEqual(called, true);
});

test('25. PROFESSIONAL supera el middleware de autorización para desactivar', (t) => {
  const middleware = requireRoles(['OWNER', 'PROFESSIONAL']);
  const req = createFakeReq('PROFESSIONAL');
  let called = false;
  middleware(req, {} as Response, (err?: any) => {
    assert.strictEqual(err, undefined);
    called = true;
  });
  assert.strictEqual(called, true);
});

test('26. Una petición sin authContext no obtiene acceso', (t) => {
  const middleware = requireRoles(['OWNER']);
  const req = createFakeReq();
  let error: any = null;
  middleware(req, {} as Response, (err?: any) => { error = err; });
  assert.ok(error instanceof AppError);
  assert.strictEqual(error.statusCode, 403);
});

test('27. Un rol no permitido no obtiene acceso', (t) => {
  const middleware = requireRoles(['OWNER']);
  const req = createFakeReq('INVALID_ROLE');
  let error: any = null;
  middleware(req, {} as Response, (err?: any) => { error = err; });
  assert.ok(error instanceof AppError);
  assert.strictEqual(error.statusCode, 403);
});
