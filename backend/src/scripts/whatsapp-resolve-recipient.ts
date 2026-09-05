import * as path from 'node:path';
import {
  createWhatsAppRuntime,
  WhatsAppRuntime
} from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { WhatsAppRecipientResolverRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppRecipientResolverRunner';
import { resolveOperatorAuthDir } from '../modules/notifications/infrastructure/baileys/resolveOperatorAuthDir';
import { isValidE164 } from '../modules/notifications/infrastructure/baileys/WhatsAppPhoneUtils';
import { terminateCli } from './cliTerminationHelper';

export const KNOWN_RECIPIENT_FAILURE_CODES = new Set<string>([
  'INVALID_ARGUMENTS',
  'CONFIRMATION_REQUIRED',
  'WHATSAPP_AUTH_PERSISTENCE_FAILED',
  'WHATSAPP_AUTH_PERSISTENCE_TIMEOUT',
  'WHATSAPP_DEVICE_REMOVED',
  'WHATSAPP_LOGGED_OUT',
  'WHATSAPP_WEB_VERSION_UNAVAILABLE',
  'WHATSAPP_NOT_CONNECTED',
  'WHATSAPP_CONNECTION_CLOSED',
  'WHATSAPP_TEMPORARY_FAILURE',
  'WHATSAPP_QUERY_NOT_SUPPORTED',
  'WHATSAPP_TIMEOUT',
  'CLEANUP_FAILED'
]);

export function resolveSanitizedErrorCode(error: unknown, fallback: string): string {
  if (typeof error === 'string' && KNOWN_RECIPIENT_FAILURE_CODES.has(error)) {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = String((error as { message: unknown })['message']);
    if (KNOWN_RECIPIENT_FAILURE_CODES.has(raw)) {
      return raw;
    }
  }
  return fallback;
}

export interface WhatsAppResolveRecipientCliArgs {
  authDir: string;
  to: string;
  confirm: string;
  timeoutMs: number;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): WhatsAppResolveRecipientCliArgs {
  let cliAuthDir: string | undefined;
  let to: string | undefined;
  let confirm: string | undefined;
  let timeoutMs = 30_000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--auth-dir') {
      const val = argv[++i];
      if (!val || !path.isAbsolute(val)) {
        throw new Error('INVALID_ARGUMENTS');
      }
      cliAuthDir = val;
    } else if (arg?.startsWith('--auth-dir=')) {
      const val = arg.split('=')[1];
      if (!val || !path.isAbsolute(val)) {
        throw new Error('INVALID_ARGUMENTS');
      }
      cliAuthDir = val;
    } else if (arg === '--to') {
      const val = argv[++i];
      if (!val || val.includes('@') || !val.startsWith('+') || !isValidE164(val)) {
        throw new Error('INVALID_ARGUMENTS');
      }
      to = val;
    } else if (arg?.startsWith('--to=')) {
      const val = arg.split('=')[1];
      if (!val || val.includes('@') || !val.startsWith('+') || !isValidE164(val)) {
        throw new Error('INVALID_ARGUMENTS');
      }
      to = val;
    } else if (arg === '--confirm') {
      const val = argv[++i];
      if (val !== 'YESKIRA_RESOLVE_RECIPIENT') {
        throw new Error('CONFIRMATION_REQUIRED');
      }
      confirm = val;
    } else if (arg?.startsWith('--confirm=')) {
      const val = arg.split('=')[1];
      if (val !== 'YESKIRA_RESOLVE_RECIPIENT') {
        throw new Error('CONFIRMATION_REQUIRED');
      }
      confirm = val;
    } else if (arg === '--timeout-ms') {
      const val = argv[++i];
      if (!val) {
        throw new Error('INVALID_ARGUMENTS');
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('INVALID_ARGUMENTS');
      }
      timeoutMs = parsed;
    } else if (arg?.startsWith('--timeout-ms=')) {
      const val = arg.split('=')[1];
      if (!val) {
        throw new Error('INVALID_ARGUMENTS');
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('INVALID_ARGUMENTS');
      }
      timeoutMs = parsed;
    } else {
      throw new Error('INVALID_ARGUMENTS');
    }
  }

  if (!to) {
    throw new Error('INVALID_ARGUMENTS');
  }

  if (confirm !== 'YESKIRA_RESOLVE_RECIPIENT') {
    throw new Error('CONFIRMATION_REQUIRED');
  }

  const authDir = resolveOperatorAuthDir({
    cliAuthDir,
    envAuthDir: process.env.WHATSAPP_AUTH_DIR,
    nodeEnv: process.env.NODE_ENV
  });

  return { authDir, to, confirm, timeoutMs };
}

export interface WhatsAppResolveRecipientCliDeps {
  runtime?: WhatsAppRuntime | undefined;
  parseArgs?: () => WhatsAppResolveRecipientCliArgs;
}

export async function main(deps?: WhatsAppResolveRecipientCliDeps): Promise<number> {
  let exitCode = 1;
  let runtime: WhatsAppRuntime | undefined;

  let parsed: WhatsAppResolveRecipientCliArgs;
  try {
    parsed = deps?.parseArgs ? deps.parseArgs() : parseArgs();
  } catch (err) {
    const failureCode = resolveSanitizedErrorCode(err, 'INVALID_ARGUMENTS');
    console.error('RECIPIENT_QUERY=FAIL');
    console.error(`FAILURE_CODE=${failureCode}`);
    return 1;
  }

  try {
    console.log('Initiating WhatsApp recipient resolution...');

    runtime =
      deps?.runtime ??
      createWhatsAppRuntime({
        authDir: parsed.authDir,
        requireAbsoluteAuthDir: true
      });

    const runner = new WhatsAppRecipientResolverRunner({
      connection: runtime.connection,
      recipientResolver: runtime.recipientResolver,
      to: parsed.to,
      timeoutMs: parsed.timeoutMs,
      registerSignalHandlers: true
    });

    const result = await runner.run();

    if (result.status === 'PASS') {
      exitCode = 0;
    } else {
      exitCode = 1;
      const failureCode = result.failureCode ?? result.status;
      console.error(`FAILURE_CODE=${resolveSanitizedErrorCode(failureCode, 'UNEXPECTED_ERROR')}`);
    }
  } catch (err) {
    const failureCode = resolveSanitizedErrorCode(err, 'UNEXPECTED_ERROR');
    console.error('RECIPIENT_QUERY=FAIL');
    console.error(`FAILURE_CODE=${failureCode}`);
    exitCode = 1;
  } finally {
    if (runtime) {
      try {
        await runtime.connection.close();
      } catch (cleanupErr) {
        const failureCode = resolveSanitizedErrorCode(cleanupErr, 'CLEANUP_FAILED');
        console.error('FINAL_CLEANUP=FAIL');
        console.error(`FAILURE_CODE=${failureCode}`);
        exitCode = 1;
      }
    }
  }

  return exitCode;
}

if (process.env.NODE_ENV !== 'test') {
  main()
    .then((code) => terminateCli(code))
    .catch(() => {
      console.error('FATAL_CLI_ERROR=UNEXPECTED');
      terminateCli(1);
    });
}
