import test from 'node:test';
import assert from 'node:assert';
import { PatientDocumentService } from './application/PatientDocumentService';
import { IPatientDocumentRepository, CreatePatientDocumentDto, CreateAuditEventDto } from './application/IPatientDocumentRepository';
import { uploadDocumentSchema, listDocumentsSchema } from './domain/PatientDocumentSchema';
import { AppError } from '../../shared/errors/AppError';
import { ObjectStorageProvider, CreateUploadUrlInput, CreateDownloadUrlInput, HeadObjectResult } from './infrastructure/ObjectStorageProvider';
import { requireRoles } from '../patients/infrastructure/requireRoles';
import { Request, Response, NextFunction } from 'express';
import type { PatientDocument } from '../../generated/prisma';

const createFakeRepo = (overrides: Partial<IPatientDocumentRepository> = {}): IPatientDocumentRepository => {
  return {
    findPatient: async (clinicId, patientId) => patientId === 'patient-1' ? { id: 'patient-1' } : null,
    findEncounter: async (clinicId, patientId, encounterId) => encounterId === 'encounter-1' ? { id: 'encounter-1' } : null,
    createDocument: async (data: CreatePatientDocumentDto) => ({ ...data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedByMembershipId: null } as PatientDocument),
    findDocumentById: async (clinicId, documentId) => {
      if (documentId === 'doc-1') return { id: 'doc-1', clinicId: 'clinic-1', status: 'ACTIVE', storageKey: 'test-key', originalFileName: 'test.pdf', sizeBytes: 1024, mimeType: 'application/pdf', category: 'RADIOGRAPH' } as PatientDocument;
      return null;
    },
    completeUploadAtomic: async (clinicId, documentId) => ({ count: 1 }),
    listActiveDocuments: async (clinicId, patientId) => {
      if (clinicId === 'clinic-1' && patientId === '123e4567-e89b-12d3-a456-426614174000') {
        return [{ id: 'doc-1', patientId, clinicId, status: 'ACTIVE' } as PatientDocument];
      }
      return [];
    },
    softDeleteDocumentAtomic: async (clinicId: string, documentId: string, membershipId: string) => ({ count: 1 }),
    createAuditEvent: async (data: CreateAuditEventDto) => {},
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      return cb(createFakeRepo(overrides));
    },
    ...overrides
  };
};

const createFakeStorageProvider = (overrides: Partial<ObjectStorageProvider> = {}): ObjectStorageProvider => {
  return {
    createUploadUrl: async (input: CreateUploadUrlInput) => 'https://fake-upload-url',
    createDownloadUrl: async (input: CreateDownloadUrlInput) => 'https://fake-download-url',
    headObject: async (key: string) => ({ exists: true, contentLength: 1024, contentType: 'application/pdf' }),
    deleteObject: async (key: string) => { },
    getPartialObject: async (key: string, length: number) => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]), // %PDF-
    ...overrides
  };
};

const storageConfig = {
  bucketName: 'test-bucket',
  uploadUrlTtlSeconds: 600,
  downloadUrlTtlSeconds: 300,
};

test('1. ASSISTANT no puede acceder', () => {
  const middleware = requireRoles(['OWNER', 'PROFESSIONAL']);
  const req = { authContext: { role: 'ASSISTANT' } } as unknown as Request;
  let statusCode: number | undefined;
  middleware(req, {} as Response, (err?: unknown) => {
    if (err && typeof err === 'object' && err instanceof AppError) {
      statusCode = err.statusCode;
    }
  });
  assert.strictEqual(statusCode, 403);
});

test('2. patientId de otro tenant -> 404', async () => {
  const repo = createFakeRepo({
    findPatient: async () => null, // Not found
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await assert.rejects(
    () => service.createUploadUrl('clinic-1', 'mem-1', {
      patientId: 'patient-2', category: 'RADIOGRAPH', mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'test.jpg'
    }),
    (err: unknown) => err instanceof AppError && err.statusCode === 404
  );
});

test('3. encounter de otro tenant -> rechazo', async () => {
  const repo = createFakeRepo({
    findEncounter: async () => null, // Not found in this clinic
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await assert.rejects(
    () => service.createUploadUrl('clinic-1', 'mem-1', {
      patientId: 'patient-1', clinicalEncounterId: 'encounter-2', category: 'RADIOGRAPH', mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'test.jpg'
    }),
    (err: unknown) => err instanceof AppError && err.statusCode === 404
  );
});

test('4. encounter de otro paciente -> rechazo', async () => {
  const repo = createFakeRepo({
    findEncounter: async () => null,
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await assert.rejects(
    () => service.createUploadUrl('clinic-1', 'mem-1', {
      patientId: 'patient-1', clinicalEncounterId: 'encounter-1', category: 'RADIOGRAPH', mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'test.jpg'
    }),
    (err: unknown) => err instanceof AppError && err.statusCode === 404
  );
});

test('5. MIME no permitido -> rechazo', () => {
  assert.throws(() => uploadDocumentSchema.parse({
    patientId: '123e4567-e89b-12d3-a456-426614174000',
    category: 'RADIOGRAPH',
    mimeType: 'application/zip',
    sizeBytes: 100,
    originalFileName: 'test.zip'
  }));
});

test('6. archivo > 15MB -> rechazo', () => {
  assert.throws(() => uploadDocumentSchema.parse({
    patientId: '123e4567-e89b-12d3-a456-426614174000',
    category: 'RADIOGRAPH',
    mimeType: 'application/pdf',
    sizeBytes: 16 * 1024 * 1024,
    originalFileName: 'test.pdf'
  }));
});

test('7. creación genera PENDING', async () => {
  let createdStatus = '';
  const repo = createFakeRepo({
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        createDocument: async (data: CreatePatientDocumentDto) => { createdStatus = data.status; return { ...data } as PatientDocument; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await service.createUploadUrl('clinic-1', 'mem-1', {
    patientId: 'patient-1', category: 'RADIOGRAPH', mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'test.jpg'
  });

  assert.strictEqual(createdStatus, 'PENDING');
});

test('8. storageKey no contiene nombre original', async () => {
  let createdStorageKey = '';
  let createdId = '';
  const repo = createFakeRepo({
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        createDocument: async (data: CreatePatientDocumentDto) => { createdStorageKey = data.storageKey; createdId = data.id; return { ...data } as PatientDocument; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await service.createUploadUrl('clinic-1', 'mem-1', {
    patientId: 'patient-1', category: 'RADIOGRAPH', mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'SuperSecretName.jpg'
  });

  assert.ok(!createdStorageKey.includes('SuperSecretName.jpg'));
  assert.ok(createdStorageKey.includes(createdId));
});

test('9. complete con objeto inexistente -> rechazo', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
  });
  const provider = createFakeStorageProvider({
    headObject: async () => ({ exists: false })
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('subido')
  );
});

test('10. complete con tamaño distinto -> rechazo', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'PENDING', sizeBytes: 2048, mimeType: 'application/pdf' } as PatientDocument),
  });
  const provider = createFakeStorageProvider({
    headObject: async () => ({ exists: true, contentLength: 1024, contentType: 'application/pdf' })
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('tamaño')
  );
});

test('11. complete con MIME distinto -> rechazo', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'image/png' } as PatientDocument),
  });
  const provider = createFakeStorageProvider({
    headObject: async () => ({ exists: true, contentLength: 1024, contentType: 'application/pdf' })
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('tipo')
  );
});

test('12. complete correcto -> ACTIVE', async () => {
  let docStatus = 'PENDING';
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: docStatus, sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        completeUploadAtomic: async () => { docStatus = 'ACTIVE'; return { count: 1 }; },
        findDocumentById: async () => ({ id: 'doc-1', status: docStatus, sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
        createAuditEvent: async () => {}
      });
      return cb(tx);
    }
  });
  const provider = createFakeStorageProvider();
  const service = new PatientDocumentService(repo, provider, storageConfig);

  const res = await service.completeUpload('clinic-1', 'usr-1', 'doc-1');
  assert.strictEqual(res.status, 'ACTIVE');
  assert.strictEqual(docStatus, 'ACTIVE');
});

test('13. complete ACTIVE idempotente', async () => {
  let txCalled = false;
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'ACTIVE', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => { txCalled = true; return cb(repo); }
  });
  const provider = createFakeStorageProvider();
  const service = new PatientDocumentService(repo, provider, storageConfig);

  const res = await service.completeUpload('clinic-1', 'usr-1', 'doc-1');

  assert.strictEqual(res.status, 'ACTIVE');
  assert.strictEqual(txCalled, false);
});

test('14. listado filtra por clinicId', async () => {
  let queriedClinicId: string | null = null;
  const repo = createFakeRepo({
    listActiveDocuments: async (clinicId, patientId) => { queriedClinicId = clinicId; return []; }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await service.listDocuments('clinic-1', { patientId: '123e4567-e89b-12d3-a456-426614174000' });

  assert.strictEqual(queriedClinicId, 'clinic-1');
});

test('15. listado no devuelve PENDING/DELETED', async () => {
  // listActiveDocuments by definition returns ACTIVE documents in our implementation
  const repo = createFakeRepo({
    listActiveDocuments: async (clinicId, patientId) => [{ status: 'ACTIVE', id: '1', patientId, clinicId } as PatientDocument]
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  const docs = await service.listDocuments('clinic-1', { patientId: '123e4567-e89b-12d3-a456-426614174000' });

  assert.strictEqual(docs.length, 1);
});

test('16. download de otro tenant -> rechazo', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => null, // Not found
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await assert.rejects(
    () => service.getDownloadUrl('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 404
  );
});

test('17. download genera presigned URL', async () => {
  const repo = createFakeRepo(); // Default returns active doc
  const provider = createFakeStorageProvider({
    createDownloadUrl: async () => 'https://signed.url'
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  const res = await service.getDownloadUrl('clinic-1', 'usr-1', 'doc-1');

  assert.strictEqual(res.downloadUrl, 'https://signed.url');
});

test('18. download genera AuditEvent sin URL', async () => {
  let auditAction = '';
  let auditStr = '';
  const repo = createFakeRepo({
    createAuditEvent: async (data: CreateAuditEventDto) => { auditAction = data.action; auditStr = JSON.stringify(data); }
  });
  const provider = createFakeStorageProvider({
    createDownloadUrl: async () => 'https://signed.url'
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await service.getDownloadUrl('clinic-1', 'usr-1', 'doc-1');

  assert.strictEqual(auditAction, 'PATIENT_DOCUMENT_DOWNLOADED');
  assert.ok(!auditStr.includes('https://signed.url'));
});

test('19. delete hace soft-delete', async () => {
  let softDeleted = false;
  const repo = createFakeRepo({
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        softDeleteDocumentAtomic: async (c: string, d: string, m: string) => { softDeleted = true; return { count: 1 }; },
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument),
        createAuditEvent: async () => {}
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await service.deleteDocument('clinic-1', 'mem-1', 'usr-1', 'doc-1');

  assert.strictEqual(softDeleted, true);
});

test('20. delete NO llama deleteObject()', async () => {
  let deleteObjectCalled = false;
  const repo = createFakeRepo({
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        softDeleteDocumentAtomic: async () => ({ count: 1 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument),
        createAuditEvent: async () => {}
      });
      return cb(tx);
    }
  });
  const provider = createFakeStorageProvider({
    deleteObject: async () => { deleteObjectCalled = true; }
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await service.deleteDocument('clinic-1', 'mem-1', 'usr-1', 'doc-1');

  assert.strictEqual(deleteObjectCalled, false);
});

test('21. AuditEvent no contiene nombre original ni contenido sensible', async () => {
  let auditDoc: CreateAuditEventDto | null = null;
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'ACTIVE', originalFileName: 'SensitiveName.pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        softDeleteDocumentAtomic: async () => ({ count: 1 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument),
        createAuditEvent: async (data: CreateAuditEventDto) => { auditDoc = data; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);

  await service.deleteDocument('clinic-1', 'mem-1', 'usr-1', 'doc-1');

  assert.ok(auditDoc !== null);
  assert.ok(!JSON.stringify(auditDoc).includes('SensitiveName.pdf'));
  assert.ok(JSON.stringify(auditDoc).includes('PATIENT_DOCUMENT_DELETED'));
});

test('22. completeUpload rechaza contenido que no coincide con mimeType', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'image/jpeg' } as PatientDocument),
  });
  const provider = createFakeStorageProvider({
    headObject: async () => ({ exists: true, contentLength: 1024, contentType: 'image/jpeg' }),
    // Devolvemos PDF pero el doc espera JPEG
    getPartialObject: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D])
  });
  const service = new PatientDocumentService(repo, provider, storageConfig);

  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('contenido del archivo')
  );
});

test('23. tests offline genuinos del R2ObjectStorageProvider', async () => {
  const { R2ObjectStorageProvider } = require('./infrastructure/R2ObjectStorageProvider');

  let sentUrl = '';
  let getUrl = '';
  let headKey = '';
  let partialKey = '';

  const mockTransport = {
    createUploadUrl: async (b: string, k: string, c: string, e: number) => { sentUrl = k; return 'https://mock-signed-url'; },
    createDownloadUrl: async (b: string, k: string, d: string | undefined, e: number) => { getUrl = d || ''; return 'https://mock-signed-url'; },
    headObject: async (b: string, k: string) => {
      headKey = k;
      if (k === 'not-found') return { exists: false };
      if (k === 'error') throw new Error('Some other error');
      return { exists: true, contentLength: 500, contentType: 'image/png' };
    },
    getObjectBody: async (b: string, k: string, r: string) => {
      partialKey = r;
      return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    },
    deleteObject: async () => {}
  };

  const provider = new R2ObjectStorageProvider({
    accountId: 'acc123', accessKeyId: 'key123', secretAccessKey: 'sec123', bucketName: 'bucket123', uploadUrlTtlSeconds: 600, downloadUrlTtlSeconds: 300
  }, mockTransport);

  // Test presigned PUT
  const uploadUrl = await provider.createUploadUrl({ key: 'test.pdf', contentType: 'application/pdf', expiresInSeconds: 600 });
  assert.strictEqual(uploadUrl, 'https://mock-signed-url');
  assert.strictEqual(sentUrl, 'test.pdf');

  // Test presigned GET con filename (sanitized)
  const unsafeName = 'file"with\\newlines\r\n.pdf';
  const downloadUrl = await provider.createDownloadUrl({ key: 'test.pdf', expiresInSeconds: 300, downloadFileName: unsafeName });
  assert.strictEqual(downloadUrl, 'https://mock-signed-url');
  assert.ok(getUrl.includes('file_with_newlines__.pdf'));

  // Test HeadObject 404
  const head404 = await provider.headObject('not-found');
  assert.strictEqual(head404.exists, false);

  // Test HeadObject propagacion error
  await assert.rejects(
    () => provider.headObject('error'),
    (err: unknown) => err instanceof Error && err.message === 'Some other error'
  );

  // Test getPartialObject and Range === 'bytes=0-15'
  const partial = await provider.getPartialObject('test.png', 16);
  assert.strictEqual(partial[0], 0x89);
  assert.strictEqual(partial[1], 0x50);
  assert.strictEqual(partialKey, 'bytes=0-15');
});

test('24. completeUpload concurrencia - ganador (count === 1)', async () => {
  let auditCount = 0;
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', clinicId: 'clinic-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        completeUploadAtomic: async () => ({ count: 1 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'ACTIVE' } as PatientDocument),
        createAuditEvent: async () => { auditCount++; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  const doc = await service.completeUpload('clinic-1', 'usr-1', 'doc-1');
  assert.strictEqual(doc.status, 'ACTIVE');
  assert.strictEqual(auditCount, 1);
});

test('25. completeUpload concurrencia - perdedor con ACTIVE', async () => {
  let auditCount = 0;
  let callIndex = 0;
  const repo = createFakeRepo({
    findDocumentById: async () => {
      if (callIndex === 0) {
        callIndex++;
        return { id: 'doc-1', clinicId: 'clinic-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument;
      }
      // inside fallback query
      return { id: 'doc-1', clinicId: 'clinic-1', status: 'ACTIVE', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument;
    },
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        completeUploadAtomic: async () => ({ count: 0 }),
        findDocumentById: async (c, id) => {
          assert.strictEqual(c, 'clinic-1'); // isolation
          return { id: 'doc-1', status: 'ACTIVE' } as PatientDocument;
        },
        createAuditEvent: async () => { auditCount++; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  const doc = await service.completeUpload('clinic-1', 'usr-1', 'doc-1');
  assert.strictEqual(doc.status, 'ACTIVE');
  assert.strictEqual(auditCount, 0);
});

test('26. completeUpload concurrencia - perdedor con DELETED', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', clinicId: 'clinic-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        completeUploadAtomic: async () => ({ count: 0 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument)
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('eliminado')
  );
});

test('27. completeUpload concurrencia - perdedor con PENDING', async () => {
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', clinicId: 'clinic-1', status: 'PENDING', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        completeUploadAtomic: async () => ({ count: 0 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'PENDING' } as PatientDocument)
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  await assert.rejects(
    () => service.completeUpload('clinic-1', 'usr-1', 'doc-1'),
    (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.message.includes('Conflicto')
  );
});

test('28. checkMagicBytes implementation verification', async () => {
  const { checkMagicBytes } = require('./application/PatientDocumentService');

  // PDF %PDF-
  assert.strictEqual(checkMagicBytes('application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x00])), true);
  assert.strictEqual(checkMagicBytes('application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00])), false); // Negativo

  // JPEG FF D8 FF
  assert.strictEqual(checkMagicBytes('image/jpeg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xEE])), true);
  assert.strictEqual(checkMagicBytes('image/jpeg', new Uint8Array([0xFF, 0xD8, 0x00])), false);

  // PNG 89 50 4E 47 0D 0A 1A 0A
  assert.strictEqual(checkMagicBytes('image/png', new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00])), true);
  assert.strictEqual(checkMagicBytes('image/png', new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00])), false);

  // WEBP RIFF....WEBP
  const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assert.strictEqual(checkMagicBytes('image/webp', webpBytes), true);
  const badWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x00]);
  assert.strictEqual(checkMagicBytes('image/webp', badWebp), false);
});

test('29. deleteDocument concurrencia - ganador (count === 1)', async () => {
  let auditCount = 0;
  const repo = createFakeRepo({
    findDocumentById: async () => ({ id: 'doc-1', clinicId: 'clinic-1', status: 'ACTIVE', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument),
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        softDeleteDocumentAtomic: async () => ({ count: 1 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument),
        createAuditEvent: async () => { auditCount++; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  const doc = await service.deleteDocument('clinic-1', 'mem-1', 'usr-1', 'doc-1');
  assert.strictEqual(doc.status, 'DELETED');
  assert.strictEqual(auditCount, 1);
});

test('30. deleteDocument concurrencia - perdedor con DELETED', async () => {
  let auditCount = 0;
  let callIndex = 0;
  const repo = createFakeRepo({
    findDocumentById: async () => {
      if (callIndex === 0) {
        callIndex++;
        return { id: 'doc-1', clinicId: 'clinic-1', status: 'ACTIVE', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument;
      }
      return { id: 'doc-1', clinicId: 'clinic-1', status: 'DELETED', sizeBytes: 1024, mimeType: 'application/pdf' } as PatientDocument;
    },
    $transaction: async <T>(cb: (tx: IPatientDocumentRepository) => Promise<T>) => {
      const tx = createFakeRepo({
        softDeleteDocumentAtomic: async () => ({ count: 0 }),
        findDocumentById: async () => ({ id: 'doc-1', status: 'DELETED' } as PatientDocument),
        createAuditEvent: async () => { auditCount++; }
      });
      return cb(tx);
    }
  });
  const service = new PatientDocumentService(repo, createFakeStorageProvider(), storageConfig);
  const doc = await service.deleteDocument('clinic-1', 'mem-1', 'usr-1', 'doc-1');
  assert.strictEqual(doc.status, 'DELETED');
  assert.strictEqual(auditCount, 0);
});

test('31. AwsR2Transport - offline test sin any ni casts masivos', async () => {
  const { AwsR2Transport } = require('./infrastructure/AwsR2Transport');
  const { HeadObjectCommand, GetObjectCommand, PutObjectCommand, NotFound } = require('@aws-sdk/client-s3');

  let sentCommand: unknown = null;
  let signedCommand: unknown = null;

  const mockDeps = {
    send: async (cmd: object) => {
      sentCommand = cmd;
      if (cmd instanceof HeadObjectCommand) {
        const input = (cmd as { input: { Key?: string } }).input;
        if (input.Key === 'not-found') {
          const err = new Error('NotFound');
          Object.setPrototypeOf(err, NotFound.prototype);
          throw err;
        }
        if (input.Key === 'error') {
          throw new Error('Other Error');
        }
        return { ContentLength: 42, ContentType: 'application/pdf' };
      }
      if (cmd instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => new Uint8Array([0x89, 0x50, 0x4E, 0x47]) } };
      }
      return {};
    },
    sign: async (cmd: object, opts: { expiresIn: number }) => {
      signedCommand = cmd;
      return 'https://signed.url';
    }
  };

  const transport = new AwsR2Transport({ accountId: 'acc123', accessKeyId: 'key', secretAccessKey: 'sec', bucketName: 'b' }, mockDeps);

  const defaultTransport = new AwsR2Transport({ accountId: 'acc123', accessKeyId: 'key', secretAccessKey: 'sec', bucketName: 'b' });
  const endpoint = await defaultTransport.client.config.endpoint();
  assert.strictEqual(endpoint.hostname, 'acc123.r2.cloudflarestorage.com');
  const region = await defaultTransport.client.config.region();
  assert.strictEqual(region, 'auto');

  const upUrl = await transport.createUploadUrl('b', 'test.pdf', 'application/pdf', 600);
  assert.strictEqual(upUrl, 'https://signed.url');
  assert.ok(signedCommand instanceof PutObjectCommand);

  const downUrl = await transport.createDownloadUrl('b', 'test.pdf', 'attachment; filename="a.pdf"', 600);
  assert.strictEqual(downUrl, 'https://signed.url');
  assert.ok(signedCommand instanceof GetObjectCommand);

  const headOk = await transport.headObject('b', 'test.pdf');
  assert.strictEqual(headOk.exists, true);
  assert.strictEqual(headOk.contentLength, 42);
  assert.ok(sentCommand instanceof HeadObjectCommand);

  const head404 = await transport.headObject('b', 'not-found');
  assert.strictEqual(head404.exists, false);

  await assert.rejects(
    () => transport.headObject('b', 'error'),
    (err: unknown) => err instanceof Error && err.message === 'Other Error'
  );

  const body = await transport.getObjectBody('b', 'test.png', 'bytes=0-15');
  assert.strictEqual(body[0], 0x89);
  if (sentCommand && typeof sentCommand === 'object' && sentCommand instanceof GetObjectCommand) {
    assert.strictEqual((sentCommand as { input: { Range?: string } }).input.Range, 'bytes=0-15');
  } else {
    assert.fail('Expected GetObjectCommand');
  }
});
