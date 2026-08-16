import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  HeadObjectResult,
  ObjectStorageProvider,
} from './ObjectStorageProvider';
import { IR2Transport } from './IR2Transport';
import { R2Config } from '../../../config/env';

export class R2ObjectStorageProvider implements ObjectStorageProvider {
  private readonly transport: IR2Transport;
  private readonly bucketName: string;

  constructor(
    config: R2Config,
    transport: IR2Transport
  ) {
    this.bucketName = config.bucketName;
    this.transport = transport;
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    return this.transport.createUploadUrl(
      this.bucketName,
      input.key,
      input.contentType,
      input.expiresInSeconds
    );
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    const contentDisposition = input.downloadFileName
      ? `attachment; filename="${this.sanitizeDownloadFileName(input.downloadFileName)}"`
      : undefined;

    return this.transport.createDownloadUrl(
      this.bucketName,
      input.key,
      contentDisposition,
      input.expiresInSeconds
    );
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    return this.transport.headObject(this.bucketName, key);
  }

  async deleteObject(key: string): Promise<void> {
    return this.transport.deleteObject(this.bucketName, key);
  }

  async getPartialObject(key: string, length: number): Promise<Uint8Array> {
    return this.transport.getObjectBody(this.bucketName, key, `bytes=0-${length - 1}`);
  }

  private sanitizeDownloadFileName(fileName: string): string {
    return fileName.replace(/["\\\r\n]/g, '_');
  }
}
