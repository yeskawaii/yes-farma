import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: z.string().default('1'),
  SESSION_COOKIE_NAME: z.string().default('yesfarma_sid'),
  SESSION_TTL_HOURS: z.string().transform(Number).default('24'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  PWNED_PASSWORDS_TIMEOUT_MS: z.coerce.number().int().min(500).max(10000).default(3000),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().min(500).max(10000).default(5000),
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

export interface EmailConfig {
  apiKey: string;
  from: string;
  timeoutMs: number;
}

export const getEmailConfig = (): EmailConfig => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Transactional email configuration is incomplete.');
  }

  return {
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    timeoutMs: env.EMAIL_TIMEOUT_MS,
  };
};

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
