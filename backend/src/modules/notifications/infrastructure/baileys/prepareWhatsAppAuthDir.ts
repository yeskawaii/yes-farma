import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PrepareAuthDirOptions {
  requireAbsolute?: boolean | undefined;
}

export const prepareWhatsAppAuthDir = (
  authDir: string,
  options: PrepareAuthDirOptions = {}
): string => {
  if (!authDir || typeof authDir !== 'string' || authDir.trim() === '') {
    throw new Error('WHATSAPP_AUTH_DIR is required and cannot be empty.');
  }

  const trimmedPath = authDir.trim();

  if (options.requireAbsolute && !path.isAbsolute(trimmedPath)) {
    throw new Error(`WHATSAPP_AUTH_DIR must be an absolute path. Received: "${trimmedPath}"`);
  }

  const resolvedPath = path.resolve(trimmedPath);

  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true, mode: 0o700 });
  } else {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`WHATSAPP_AUTH_DIR path exists but is not a directory: "${resolvedPath}"`);
    }

    try {
      fs.chmodSync(resolvedPath, 0o700);
    } catch {
      // Ignore chmod errors on platforms where chmod is not supported
    }
  }

  return resolvedPath;
};
