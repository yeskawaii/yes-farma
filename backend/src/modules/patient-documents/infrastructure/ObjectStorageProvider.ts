export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlInput {
  key: string;
  expiresInSeconds: number;
  downloadFileName?: string;
}

export interface CreatePreviewUrlInput {
  key: string;
  expiresInSeconds: number;
  previewFileName?: string;
}

export interface HeadObjectResult {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

export interface ObjectStorageProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  createPreviewUrl(input: CreatePreviewUrlInput): Promise<string>;
  headObject(key: string): Promise<HeadObjectResult>;
  deleteObject(key: string): Promise<void>;
  getPartialObject(key: string, length: number): Promise<Uint8Array>;
}
