import { createWhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { WhatsAppProbeRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppProbeRunner';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';

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

const main = async () => {
  const { authDir, timeoutMs } = parseProbeArgs();

  console.log('Initiating WhatsApp connection probe...');
  const runtime = createWhatsAppRuntime({
    authDir,
    requireAbsoluteAuthDir: true
  });

  const runner = new WhatsAppProbeRunner({
    connection: runtime.connection,
    timeoutMs,
    registerSignalHandlers: true
  });

  const result = await runner.run();

  if (result.status === 'PASS') {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Fatal error during WhatsApp probe:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
