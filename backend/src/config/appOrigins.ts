import { env } from './env';

const normalizeOrigin = (value: string): string => new URL(value).origin;

export const buildAllowedOrigins = (
  appOrigin: string,
  additionalOriginsRaw = '',
): string[] => {
  const origins = [
    appOrigin,
    ...additionalOriginsRaw.split(','),
  ]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return [...new Set(origins)];
};

export const allowedAppOrigins = buildAllowedOrigins(
  env.APP_ORIGIN,
  env.APP_ADDITIONAL_ORIGINS,
);

export const allowedAppOriginSet = new Set(allowedAppOrigins);
