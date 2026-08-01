import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: z.string().default('1'),
  SESSION_COOKIE_NAME: z.string().default('yesfarma_sid'),
  SESSION_TTL_HOURS: z.string().transform(Number).default('24'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
