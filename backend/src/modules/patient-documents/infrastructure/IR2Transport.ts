export interface TransportHeadObjectResult {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

export interface IR2Transport {
  createUploadUrl(bucketName: string, key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  createDownloadUrl(bucketName: string, key: string, contentDisposition: string | undefined, expiresInSeconds: number): Promise<string>;
  headObject(bucketName: string, key: string): Promise<TransportHeadObjectResult>;
  deleteObject(bucketName: string, key: string): Promise<void>;
  getObjectBody(bucketName: string, key: string, range: string): Promise<Uint8Array>;
}
