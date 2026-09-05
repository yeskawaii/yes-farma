import { createWhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { WhatsAppProbeRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppProbeRunner';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';
import { terminateCli } from './cliTerminationHelper';

export const parseProbeArgs = () => {
  const args = process.argv.slice(2);
  let cliAuthDir: string | undefined;
  let timeoutSeconds = 30;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--auth-dir' && args[i + 1]) {
      cliAuthDir = args[i + 1];
      i++;
    } else if (arg?.startsWith('--auth-dir=')) {
      cliAuthDir = arg.split('=')[1];
    } else if (arg === '--timeout' && args[i + 1]) {
      const parsed = parseInt(args[i + 1]!, 10);
      if (!isNaN(parsed) && parsed > 0) timeoutSeconds = parsed;
      i++;
    } else if (arg?.startsWith('--timeout=')) {
      const parsed = parseInt(arg.split('=')[1]!, 10);
      if (!isNaN(parsed) && parsed > 0) timeoutSeconds = parsed;
    }
  }

  const authDir = resolveOperatorAuthDir({
    cliAuthDir,
    envAuthDir: process.env.WHATSAPP_AUTH_DIR,
    nodeEnv: process.env.NODE_ENV
  });

  return { authDir, timeoutMs: timeoutSeconds * 1000 };
};

export const main = async (deps?: {
  runtime?: ReturnType<typeof createWhatsAppRuntime>;
  parseArgs?: typeof parseProbeArgs;
}): Promise<number> => {
  let runtime: ReturnType<typeof createWhatsAppRuntime> | undefined;
  let exitCode = 1;

  try {
    const { authDir, timeoutMs } = deps?.parseArgs ? deps.parseArgs() : parseProbeArgs();

    console.log('Initiating WhatsApp connection probe...');
    runtime = deps?.runtime ?? createWhatsAppRuntime({
      authDir,
      requireAbsoluteAuthDir: true
    });

    const runner = new WhatsAppProbeRunner({
      connection: runtime.connection,
      timeoutMs,
      registerSignalHandlers: true
    });

    const result = await runner.run();
    exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (err) {
    console.error('Fatal error during WhatsApp probe:', err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    if (runtime) {
      try {
        await runtime.connection.close();
      } catch (cleanupErr) {
        console.error('Final cleanup error during WhatsApp probe:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
        exitCode = 1;
      }
    }
  }

  return exitCode;
};

if (process.env.NODE_ENV !== 'test') {
  main()
    .then((code) => terminateCli(code))
    .catch((err) => {
      console.error('Fatal CLI error:', err instanceof Error ? err.message : err);
      terminateCli(1);
    });
}
