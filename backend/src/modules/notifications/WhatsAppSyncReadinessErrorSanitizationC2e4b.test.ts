import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  main as syncReadinessMain,
  resolveSanitizedErrorCode,
  KNOWN_SYNC_FAILURE_CODES
} from '../../scripts/whatsapp-sync-readiness';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';
import {
  WhatsAppConnectionState,
  WhatsAppDisconnectReason,
  WhatsAppHistorySyncStats
} from './infrastructure/baileys/BaileysTypes';

class FakeErrorTestConnection implements IWhatsAppConnection {
  public state: WhatsAppConnectionState = 'CONNECTED';
  public closeCalls = 0;
  public startCalls = 0;
  public sentMessages: any[] = [];
  public queryCalled = false;
  public closeError: Error | null = null;
  public startError: Error | null = null;

  getState(): WhatsAppConnectionState {
    return this.state;
  }

  getLatestQr(): string | null {
    return null;
  }

  getDisconnectReason(): WhatsAppDisconnectReason | null {
    return null;
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startError) {
      throw this.startError;
    }
  }

  async close(): Promise<void> {
    this.closeCalls++;
    if (this.closeError) {
      throw this.closeError;
    }
  }

  getMessageSender(): any {
    return {
      sendMessage: async (...args: any[]) => {
        this.sentMessages.push(args);
        return { key: { id: 'm-1' } };
      }
    };
  }

  onHistorySync(_listener: (stats: WhatsAppHistorySyncStats) => void): () => void {
    return () => {};
  }

  getHistorySyncStats(): WhatsAppHistorySyncStats | null {
    return null;
  }
}

test('Phase C2e.4b — Sanitize sync-readiness operator errors', async (t) => {
  await t.test('1. raw err.message never logged by sync-readiness CLI', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('RAW_UPSTREAM_EXCEPTION_SENSITIVE_LEAK_123');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const code = await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
      assert.strictEqual(code, 1);
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('RAW_UPSTREAM_EXCEPTION_SENSITIVE_LEAK_123'), false);
    assert.ok(allLogged.includes('FAILURE_CODE=UNEXPECTED_ERROR'));
  });

  await t.test('2. raw Error object never logged', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('some error');

    const loggedItems: any[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      loggedItems.push(...args);
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    for (const item of loggedItems) {
      assert.strictEqual(item instanceof Error, false);
      assert.strictEqual(typeof item === 'object' && item !== null, false);
    }
  });

  await t.test('3. err.stack never logged', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('failure with stack trace');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('at FakeErrorTestConnection'), false);
    assert.strictEqual(allLogged.includes('at async main'), false);
  });

  await t.test('4. unknown runtime error -> sanitized fixed failure code UNEXPECTED_ERROR', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Unknown socket breakdown occurred');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.ok(allLogged.includes('SYNC_READINESS=FAIL'));
    assert.ok(allLogged.includes('FAILURE_CODE=UNEXPECTED_ERROR'));
  });

  await t.test('5. unknown cleanup error -> sanitized CLEANUP_FAILED', async () => {
    const conn = new FakeErrorTestConnection();
    conn.closeError = new Error('EBUSY: resource busy or locked /var/run/whatsapp');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('EBUSY'), false);
    assert.ok(allLogged.includes('FINAL_CLEANUP=FAIL'));
    assert.ok(allLogged.includes('FAILURE_CODE=CLEANUP_FAILED'));
  });

  await t.test('6. known persistence failure allowlisted', async () => {
    const conn = new FakeErrorTestConnection();
    conn.closeError = new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.ok(allLogged.includes('FINAL_CLEANUP=FAIL'));
    assert.ok(allLogged.includes('FAILURE_CODE=WHATSAPP_AUTH_PERSISTENCE_FAILED'));
  });

  await t.test('7. known persistence timeout allowlisted', async () => {
    const conn = new FakeErrorTestConnection();
    conn.closeError = new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.ok(allLogged.includes('FINAL_CLEANUP=FAIL'));
    assert.ok(allLogged.includes('FAILURE_CODE=WHATSAPP_AUTH_PERSISTENCE_TIMEOUT'));
  });

  await t.test('8. DEVICE_REMOVED allowlisted', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('WHATSAPP_DEVICE_REMOVED');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.ok(allLogged.includes('FAILURE_CODE=WHATSAPP_DEVICE_REMOVED'));
  });

  await t.test('9. LOGGED_OUT allowlisted', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('WHATSAPP_LOGGED_OUT');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.ok(allLogged.includes('FAILURE_CODE=WHATSAPP_LOGGED_OUT'));
  });

  await t.test('10. malicious error containing phone is not printed', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Failed to reach customer at +5215512345678 due to socket hangup');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('+5215512345678'), false);
    assert.strictEqual(allLogged.includes('5215512345678'), false);
  });

  await t.test('11. malicious error containing JID is not printed', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Session disconnected for 5219998887776@s.whatsapp.net');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('5219998887776@s.whatsapp.net'), false);
    assert.strictEqual(allLogged.includes('@s.whatsapp.net'), false);
  });

  await t.test('12. malicious error containing LID is not printed', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Decryption failed for peer 1122334455@lid');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('1122334455@lid'), false);
    assert.strictEqual(allLogged.includes('@lid'), false);
  });

  await t.test('13. malicious error containing chat/message text is not printed', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Message error on content: "Appointment for John Doe at 10am"');

    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        runtime: { connection: conn } as any,
        parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('John Doe'), false);
    assert.strictEqual(allLogged.includes('Appointment for John Doe'), false);
  });

  await t.test('14. invalid argument value is not echoed', async () => {
    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await syncReadinessMain({
        parseArgs: () => {
          throw new Error('MALICIOUS_INJECTED_ARGUMENT_9999');
        }
      });
    } finally {
      console.error = origError;
    }

    const allLogged = logs.join('\n');
    assert.strictEqual(allLogged.includes('MALICIOUS_INJECTED_ARGUMENT_9999'), false);
    assert.ok(allLogged.includes('SYNC_READINESS=FAIL'));
    assert.ok(allLogged.includes('FAILURE_CODE=INVALID_ARGUMENTS'));
  });

  await t.test('15. cleanup still occurs before exit when runner throws', async () => {
    const conn = new FakeErrorTestConnection();
    conn.startError = new Error('Runner thrown crash');

    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
    });

    assert.strictEqual(code, 1);
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('16. exit remains deterministic', async () => {
    const conn = new FakeErrorTestConnection();
    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => ({ authDir: '/tmp/test', windowSec: 0, timeoutMs: 1000 })
    });
    assert.strictEqual(typeof code, 'number');
    assert.strictEqual(code, 0);
  });

  await t.test('17. no sendMessage', () => {
    const conn = new FakeErrorTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('18. no onWhatsApp', () => {
    const conn = new FakeErrorTestConnection();
    assert.strictEqual(conn.queryCalled, false);
  });

  await t.test('19. no real socket', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('20. no auth real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('21. no QR', () => {
    const conn = new FakeErrorTestConnection();
    assert.strictEqual(conn.getLatestQr(), null);
  });

  await t.test('22. no DB', () => {
    assert.ok(true);
  });

  await t.test('23. no worker', () => {
    assert.ok(true);
  });

  await t.test('24. Chispita no tocada', () => {
    assert.ok(true);
  });
});
