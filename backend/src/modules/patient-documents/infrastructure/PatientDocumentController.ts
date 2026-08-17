import { Request, Response, NextFunction } from 'express';
import { PatientDocumentService } from '../application/PatientDocumentService';
import { uploadDocumentSchema, listDocumentsSchema } from '../domain/PatientDocumentSchema';
import { AuthContext } from '../../../middlewares/auth';
import { getR2Config } from '../../../config/env';
import { R2ObjectStorageProvider } from './R2ObjectStorageProvider';
import { AwsR2Transport } from './AwsR2Transport';
import { PrismaPatientDocumentRepository } from './PrismaPatientDocumentRepository';
import { prisma } from '../../../infrastructure/database/prisma';
import { ZodError, z } from 'zod';
import { AppError } from '../../../shared/errors/AppError';

export interface AuthenticatedRequest extends Request {
  authContext: AuthContext;
}

const getService = () => {
  const r2Config = getR2Config();
  const transport = new AwsR2Transport(r2Config);
  const storageProvider = new R2ObjectStorageProvider(r2Config, transport);
  const repo = new PrismaPatientDocumentRepository(prisma);
  return new PatientDocumentService(repo, storageProvider, r2Config);
};

export class PatientDocumentController {
  static async createUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const input = uploadDocumentSchema.parse(req.body);
      const service = getService();

      const result = await service.createUploadUrl(
        ctx.clinicId,
        ctx.membershipId,
        input
      );

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }

  static async completeUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const id = z.string().uuid().parse(req.params.id);
      const service = getService();

      const result = await service.completeUpload(
        ctx.clinicId,
        ctx.userId,
        id
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }

  static async listDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const query = listDocumentsSchema.parse(req.query);
      const service = getService();

      const documents = await service.listDocuments(ctx.clinicId, query);

      res.status(200).json(documents);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }

  static async getDownloadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const id = z.string().uuid().parse(req.params.id);
      const service = getService();

      const result = await service.getDownloadUrl(
        ctx.clinicId,
        ctx.userId,
        id
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }

  static async getPreviewUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const id = z.string().uuid().parse(req.params.id);
      const service = getService();

      const result = await service.getPreviewUrl(
        ctx.clinicId,
        ctx.userId,
        id
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }

  static async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = (req as AuthenticatedRequest).authContext;
      const id = z.string().uuid().parse(req.params.id);
      const service = getService();

      const result = await service.deleteDocument(
        ctx.clinicId,
        ctx.membershipId,
        ctx.userId,
        id
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('INVALID_INPUT', 'Datos de entrada inválidos', 400));
        return;
      }
      next(error);
    }
  }
}
