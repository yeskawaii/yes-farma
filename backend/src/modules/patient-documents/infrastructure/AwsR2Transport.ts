import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  NotFound
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IR2Transport, TransportHeadObjectResult } from './IR2Transport';
import { R2Config } from '../../../config/env';

export class AwsR2Transport implements IR2Transport {
  public readonly client: S3Client;

  constructor(
    config: R2Config,
    private readonly deps?: {
      send?: (command: HeadObjectCommand | GetObjectCommand | DeleteObjectCommand) => Promise<object>;
      sign?: (command: PutObjectCommand | GetObjectCommand, options: { expiresIn: number }) => Promise<string>;
    }
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private async executeSend<T>(command: HeadObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<T> {
    if (this.deps?.send) return this.deps.send(command) as Promise<T>;
    return this.client.send(command as Parameters<S3Client['send']>[0]) as Promise<T>;
  }

  private async executeSign(command: PutObjectCommand | GetObjectCommand, options: { expiresIn: number }): Promise<string> {
    if (this.deps?.sign) return this.deps.sign(command, options);
    return getSignedUrl(this.client, command as Parameters<typeof getSignedUrl>[1], options);
  }

  async createUploadUrl(bucketName: string, key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    return this.executeSign(command, {
      expiresIn: expiresInSeconds,
    });
  }

  async createDownloadUrl(bucketName: string, key: string, contentDisposition: string | undefined, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: contentDisposition,
    });

    return this.executeSign(command, {
      expiresIn: expiresInSeconds,
    });
  }

  async headObject(bucketName: string, key: string): Promise<TransportHeadObjectResult> {
    try {
      const result = await this.executeSend<{ ContentLength?: number; ContentType?: string }>(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      const res: TransportHeadObjectResult = { exists: true };
      if (result.ContentLength !== undefined) res.contentLength = result.ContentLength;
      if (result.ContentType !== undefined) res.contentType = result.ContentType;
      return res;
    } catch (error) {
      if (
        error instanceof NotFound ||
        (this.isAwsError(error) && error.$metadata?.httpStatusCode === 404)
      ) {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObject(bucketName: string, key: string): Promise<void> {
    await this.executeSend(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
  }

  async getObjectBody(bucketName: string, key: string, range: string): Promise<Uint8Array> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      Range: range,
    });

    const response = await this.executeSend<{ Body?: { transformToByteArray(): Promise<Uint8Array> } }>(command);

    if (!response.Body) {
      throw new Error('Empty response body from object storage');
    }

    return response.Body.transformToByteArray();
  }

  private isAwsError(
    error: unknown
  ): error is { $metadata?: { httpStatusCode?: number } } {
    return typeof error === 'object' && error !== null && '$metadata' in error;
  }
}
