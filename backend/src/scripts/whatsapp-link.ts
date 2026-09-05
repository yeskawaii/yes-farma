import { createWhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { TerminalQrRenderer } from '../modules/notifications/infrastructure/baileys/TerminalQrRenderer';
import { WhatsAppLinkRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppLinkRunner';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';
import { terminateCli } from './cliTerminationHelper';

export const parseLinkArgs = () => {
  const args = process.argv.slice(2);
  let cliAuthDir: string | undefined;
  let timeoutSeconds = 120;

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
  parseArgs?: typeof parseLinkArgs;
}): Promise<number> => {
  let runtime: ReturnType<typeof createWhatsAppRuntime> | undefined;
  let exitCode = 1;

  try {
    const { authDir, timeoutMs } = deps?.parseArgs ? deps.parseArgs() : parseLinkArgs();

    console.log('Initiating WhatsApp Linkage procedure...');
    runtime = deps?.runtime ?? createWhatsAppRuntime({
      authDir,
      requireAbsoluteAuthDir: true
    });
    const qrRenderer = new TerminalQrRenderer();

    const runner = new WhatsAppLinkRunner({
      connection: runtime.connection,
      qrRenderer,
      timeoutMs,
      registerSignalHandlers: true
    });

    const result = await runner.run();
    exitCode = result.status === 'LINKED' ? 0 : 1;
  } catch (err) {
    console.error('Fatal error during WhatsApp linkage:', err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    if (runtime) {
      try {
        await runtime.connection.close();
      } catch (cleanupErr) {
        console.error('Final cleanup error during WhatsApp linkage:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
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
