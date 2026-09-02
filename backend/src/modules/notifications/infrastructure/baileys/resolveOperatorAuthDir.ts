import * as path from 'node:path';
import * as os from 'node:os';

export interface ResolveOperatorAuthDirOptions {
  cliAuthDir?: string | undefined;
  envAuthDir?: string | undefined;
  nodeEnv?: string | undefined;
  homedir?: string | undefined;
}

export const resolveOperatorAuthDir = (options: ResolveOperatorAuthDirOptions = {}): string => {
  const cli = options.cliAuthDir?.trim();
  if (cli) {
    return cli;
  }

  const env = options.envAuthDir?.trim();
  if (env) {
    return env;
  }

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('WHATSAPP_AUTH_DIR_REQUIRED');
  }

  const home = options.homedir ?? os.homedir();
  return path.join(home, '.yeskira', 'whatsapp-auth');
};
