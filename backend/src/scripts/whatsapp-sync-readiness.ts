import * as path from 'node:path';
import * as os from 'node:os';
import { createWhatsAppRuntime, WhatsAppRuntime } from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { WhatsAppSyncReadinessRunner } from '../modules/notifications/infrastructure/baileys/WhatsAppSyncReadinessRunner';
import { terminateCli } from './cliTerminationHelper';

export const KNOWN_SYNC_FAILURE_CODES = new Set<string>([
  'WHATSAPP_AUTH_PERSISTENCE_FAILED',
  'WHATSAPP_AUTH_PERSISTENCE_TIMEOUT',
  'WHATSAPP_DEVICE_REMOVED',
  'WHATSAPP_LOGGED_OUT',
  'WHATSAPP_WEB_VERSION_UNAVAILABLE',
  'WHATSAPP_NOT_CONNECTED',
  'WHATSAPP_CONNECTION_CLOSED',
  'WHATSAPP_TEMPORARY_FAILURE'
]);

export function resolveSanitizedErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = String((error as { message: unknown })['message']);
    if (KNOWN_SYNC_FAILURE_CODES.has(raw)) {
      return raw;
    }
  }
  return fallback;
}

export interface WhatsAppSyncReadinessCliArgs {
  authDir: string;
  windowSec: number;
  timeoutMs: number;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): WhatsAppSyncReadinessCliArgs {
  let authDir = process.env.WHATSAPP_AUTH_DIR || path.join(os.homedir(), '.yeskira', 'whatsapp-auth');
  let windowSec = 120;
  let timeoutMs = 30_000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--auth-dir') {
      const val = argv[++i];
      if (!val) {
        throw new Error('INVALID_ARGUMENTS');
      }
      authDir = val;
    } else if (arg === '--window-sec') {
      const val = argv[++i];
      if (!val) {
        throw new Error('INVALID_ARGUMENTS');
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 0) {
        throw new Error('INVALID_ARGUMENTS');
      }
      windowSec = parsed;
    } else if (arg === '--timeout-ms') {
      const val = argv[++i];
      if (!val) {
        throw new Error('INVALID_ARGUMENTS');
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 0) {
        throw new Error('INVALID_ARGUMENTS');
      }
      timeoutMs = parsed;
    } else {
      throw new Error('INVALID_ARGUMENTS');
    }
  }

  return { authDir, windowSec, timeoutMs };
}

export interface WhatsAppSyncReadinessCliDeps {
  runtime?: WhatsAppRuntime | undefined;
  parseArgs?: () => WhatsAppSyncReadinessCliArgs;
}

export async function main(deps?: WhatsAppSyncReadinessCliDeps): Promise<number> {
  let exitCode = 1;
  let runtime: WhatsAppRuntime | undefined;

  let parsed: WhatsAppSyncReadinessCliArgs;
  try {
    parsed = deps?.parseArgs ? deps.parseArgs() : parseArgs();
  } catch {
    console.error('SYNC_READINESS=FAIL');
    console.error('FAILURE_CODE=INVALID_ARGUMENTS');
    return 1;
  }

  try {
    console.log(`Initiating WhatsApp sync readiness evaluation (observation window: ${parsed.windowSec}s)...`);

    runtime =
      deps?.runtime ??
      createWhatsAppRuntime({
        authDir: parsed.authDir,
        syncFullHistory: false
      });

    const runner = new WhatsAppSyncReadinessRunner({
      connection: runtime.connection,
      observationWindowMs: parsed.windowSec * 1000,
      connectTimeoutMs: parsed.timeoutMs,
      registerSignalHandlers: true
    });

    const result = await runner.run();

    if (
      result.status === 'COMPLETE' ||
      result.status === 'PARTIAL' ||
      result.status === 'NO_EVENT'
    ) {
      exitCode = 0;
    } else {
      exitCode = 1;
    }
  } catch (err) {
    const failureCode = resolveSanitizedErrorCode(err, 'UNEXPECTED_ERROR');
    console.error('SYNC_READINESS=FAIL');
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
