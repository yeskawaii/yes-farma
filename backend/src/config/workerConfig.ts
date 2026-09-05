import { z } from 'zod';

export interface WorkerConfig {
  enabled: boolean;
  pollIntervalMs: number;
}

export const workerConfigSchema = z.object({
  NOTIFICATION_WORKER_ENABLED: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: 'NOTIFICATION_WORKER_ENABLED must be "true" or "false"' })
    })
    .default('false')
    .transform((v) => v === 'true'),
  NOTIFICATION_WORKER_POLL_MS: z
    .string()
    .default('5000')
    .refine((val) => /^\d+$/.test(val), {
      message: 'NOTIFICATION_WORKER_POLL_MS must be an integer string'
    })
    .transform(Number)
    .refine((val) => val >= 1000, {
      message: 'NOTIFICATION_WORKER_POLL_MS must be at least 1000 ms (no sub-second frequency)'
    })
});

export function parseWorkerConfig(envSource: Record<string, string | undefined> = process.env): WorkerConfig {
  const result = workerConfigSchema.safeParse(envSource);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message || 'INVALID_WORKER_CONFIG');
  }

  return {
    enabled: result.data.NOTIFICATION_WORKER_ENABLED,
    pollIntervalMs: result.data.NOTIFICATION_WORKER_POLL_MS
  };
}
