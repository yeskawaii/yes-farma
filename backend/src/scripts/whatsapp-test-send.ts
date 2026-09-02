import { createWhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';
import {
  WhatsAppTestSendRunner,
  isValidE164
} from '../modules/notifications/infrastructure/baileys/WhatsAppTestSendRunner';

export const parseTestSendArgs = () => {
  const args = process.argv.slice(2);
  let cliAuthDir: string | undefined;
  let to: string | undefined;
  let confirm: string | undefined;
  let timeoutSeconds = 30;
  let hasMessageArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--auth-dir' && args[i + 1]) {
      cliAuthDir = args[i + 1];
      i++;
    } else if (arg?.startsWith('--auth-dir=')) {
      cliAuthDir = arg.split('=')[1];
    } else if (arg === '--to' && args[i + 1]) {
      to = args[i + 1];
      i++;
    } else if (arg?.startsWith('--to=')) {
      to = arg.split('=')[1];
    } else if (arg === '--confirm' && args[i + 1]) {
      confirm = args[i + 1];
      i++;
    } else if (arg?.startsWith('--confirm=')) {
      confirm = arg.split('=')[1];
    } else if (arg === '--timeout' && args[i + 1]) {
      const parsed = parseInt(args[i + 1]!, 10);
      if (!isNaN(parsed) && parsed > 0) timeoutSeconds = parsed;
      i++;
    } else if (arg?.startsWith('--timeout=')) {
      const parsed = parseInt(arg.split('=')[1]!, 10);
      if (!isNaN(parsed) && parsed > 0) timeoutSeconds = parsed;
    } else if (arg === '--message' || arg?.startsWith('--message=')) {
      hasMessageArg = true;
    }
  }

  const authDir = resolveOperatorAuthDir({
    cliAuthDir,
    envAuthDir: process.env.WHATSAPP_AUTH_DIR,
    nodeEnv: process.env.NODE_ENV
  });

  return {
    authDir,
    to,
    confirm,
    hasMessageArg,
    timeoutMs: timeoutSeconds * 1000
  };
};

export const main = async () => {
  const { authDir, to, confirm, hasMessageArg, timeoutMs } = parseTestSendArgs();

  if (hasMessageArg) {
    console.error('WHATSAPP_TEST_SEND=ABORTED');
    console.error('FAILURE_CODE=MESSAGE_NOT_ALLOWED');
    process.exitCode = 1;
    return;
  }

  if (confirm !== 'YESKIRA_SEND_TEST') {
    console.error('WHATSAPP_TEST_SEND=ABORTED');
    process.exitCode = 1;
    return;
  }

  if (!to || !isValidE164(to)) {
    console.error('WHATSAPP_TEST_SEND=INVALID_RECIPIENT');
    process.exitCode = 1;
    return;
  }

  const runtime = createWhatsAppRuntime({
    authDir,
    requireAbsoluteAuthDir: true
  });

  const runner = new WhatsAppTestSendRunner({
    connection: runtime.connection,
    to,
    confirm,
    timeoutMs,
    registerSignalHandlers: true
  });

  const result = await runner.run();

  if (result.status === 'PASS' && !result.cleanupFailed && !result.authPersistenceFailed) {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== 'test') {
  main().catch(() => {
    console.error('WHATSAPP_TEST_SEND=FAIL');
    console.error('FAILURE_CODE=FATAL_ERROR');
    console.error('SEND_ATTEMPTED=UNKNOWN');
    console.error('AUTOMATIC_RETRY=NO');
    process.exitCode = 1;
  });
}
