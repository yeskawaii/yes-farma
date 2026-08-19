import { z } from 'zod';

export const trustProxySchema = z.string().optional().default('0').transform((val, ctx) => {
  if (val === '0' || val === 'false' || val === '') return 0;

  if (/^\d+$/.test(val)) {
    const parsed = parseInt(val, 10);
    if (parsed > 0) return parsed;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Invalid TRUST_PROXY value',
  });
  return z.NEVER;
});
