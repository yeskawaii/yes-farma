import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: z.string().default('1'),
  SESSION_COOKIE_NAME: z.string().default('yesfarma_sid'),
  SESSION_TTL_HOURS: z.string().transform(Number).default('24'),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_UPLOAD_URL_TTL_SECONDS: z.string().transform(Number).default('600'),
  R2_DOWNLOAD_URL_TTL_SECONDS: z.string().transform(Number).default('300'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  uploadUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
}

export const getR2Config = (): R2Config => {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    throw new Error('R2 storage configuration is incomplete.');
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    uploadUrlTtlSeconds: env.R2_UPLOAD_URL_TTL_SECONDS,
    downloadUrlTtlSeconds: env.R2_DOWNLOAD_URL_TTL_SECONDS,
  };
};
