import { createWhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { TerminalQrRenderer } from '../modules/notifications/infrastructure/baileys/TerminalQrRenderer';
import { WhatsAppLinkRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppLinkRunner';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';

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

const main = async () => {
  const { authDir, timeoutMs } = parseLinkArgs();

  console.log('Initiating WhatsApp Linkage procedure...');
  const runtime = createWhatsAppRuntime({
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

  if (result.status === 'LINKED') {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Fatal error during WhatsApp linkage:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
