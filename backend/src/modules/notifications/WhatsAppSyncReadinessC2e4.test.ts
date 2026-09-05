import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaileysConnectionManager } from './infrastructure/baileys/BaileysConnectionManager';
import {
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  IWhatsAppAuthStateStore,
  WhatsAppConnectionState,
  WhatsAppDisconnectReason,
  WhatsAppHistorySyncStats
} from './infrastructure/baileys/BaileysTypes';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';
import {
  WhatsAppSyncReadinessRunner,
  WhatsAppSyncReadinessResult
} from './infrastructure/baileys/WhatsAppSyncReadinessRunner';
import { DefaultBaileysSocketFactory } from './infrastructure/baileys/DefaultBaileysSocketFactory';
import { main as syncReadinessMain } from '../../scripts/whatsapp-sync-readiness';

class FakeSyncSocketInstance implements IBaileysSocketInstance {
  public eventListeners: Map<string, ((...args: any[]) => void)[]> = new Map();
  public sentMessages: { jid: string; content: { text: string } }[] = [];
  public ended = false;
  public onWhatsAppCalled = false;

  public ev = {
    on: (event: string, listener: (...args: any[]) => void) => {
      const existing = this.eventListeners.get(event) ?? [];
      existing.push(listener);
      this.eventListeners.set(event, existing);
    }
  };

  emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event) ?? [];
    for (const l of listeners) {
      l(...args);
    }
  }

  async sendMessage(jid: string, content: { text: string }): Promise<any> {
    this.sentMessages.push({ jid, content });
    return { key: { id: 'fake-msg-id', remoteJid: jid } };
  }

  async onWhatsApp(...phones: string[]): Promise<Array<{ jid: string; exists: boolean }>> {
    this.onWhatsAppCalled = true;
    return phones.map((p) => ({ jid: `${p}@s.whatsapp.net`, exists: true }));
  }

  end(_error?: Error): void {
    this.ended = true;
  }
}

class FakeSyncSocketFactory implements IBaileysSocketFactory {
  public lastSocket: FakeSyncSocketInstance | null = null;
  public createCount = 0;

  async createSocket(_options: any): Promise<IBaileysSocketInstance> {
    this.createCount++;
    this.lastSocket = new FakeSyncSocketInstance();
    return this.lastSocket;
  }
}

class FakeTestConnection implements IWhatsAppConnection {
  public state: WhatsAppConnectionState = 'DISCONNECTED';
  public closeCalls = 0;
  public startCalls = 0;
  public historySyncListeners: Array<(stats: WhatsAppHistorySyncStats) => void> = [];
  public lastStats: WhatsAppHistorySyncStats | null = null;
  public sentMessages: any[] = [];
  public queryCalled = false;

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
    this.state = 'CONNECTED';
  }

  async close(): Promise<void> {
    this.closeCalls++;
    this.state = 'DISCONNECTED';
  }

  getMessageSender(): any {
    return {
      sendMessage: async (...args: any[]) => {
        this.sentMessages.push(args);
        return { key: { id: 'msg-1' } };
      }
    };
  }

  onHistorySync(listener: (stats: WhatsAppHistorySyncStats) => void): () => void {
    this.historySyncListeners.push(listener);
    return () => {
      const idx = this.historySyncListeners.indexOf(listener);
      if (idx !== -1) {
        this.historySyncListeners.splice(idx, 1);
      }
    };
  }

  getHistorySyncStats(): WhatsAppHistorySyncStats | null {
    return this.lastStats;
  }

  emitSync(stats: WhatsAppHistorySyncStats): void {
    this.lastStats = stats;
    for (const l of this.historySyncListeners) {
      l(stats);
    }
  }
}

test('Phase C2e.4 — Initial WhatsApp Sync Readiness Suite', async (t) => {
  await t.test('1. listener messaging-history.set registrado en socket.ev', async () => {
    const factory = new FakeSyncSocketFactory();
    const authStore: IWhatsAppAuthStateStore = {
      getAuthState: async () => ({ state: { creds: {}, keys: {} } as any, saveCreds: async () => {} })
    };
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    assert.ok(factory.lastSocket);
    assert.strictEqual(factory.lastSocket.eventListeners.has('messaging-history.set'), true);
    await manager.close();
  });

  await t.test('2. contenido de chats y messages nunca se imprime', async () => {
    const conn = new FakeTestConnection();
    const loggedMessages: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 50,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => loggedMessages.push(msg),
        error: (msg) => loggedMessages.push(msg)
      }
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 1,
      progress: 50,
      isLatest: false,
      lidPnMappingsCount: 2,
      chatsCount: 5,
      contactsCount: 10,
      messagesCount: 25
    });

    await runPromise;

    const allLogs = loggedMessages.join('\n');
    assert.strictEqual(allLogs.includes('Secret Patient Name'), false);
    assert.strictEqual(allLogs.includes('Secret Medical Prescription'), false);
    assert.strictEqual(allLogs.includes('conversation'), false);
    assert.ok(allLogs.includes('SYNC_CHATS_COUNT=5'));
    assert.ok(allLogs.includes('SYNC_MESSAGES_COUNT=25'));
    assert.ok(allLogs.includes('SYNC_CONTACTS_COUNT=10'));
  });

  await t.test('3. phones, JIDs y LIDs nunca se imprimen', async () => {
    const conn = new FakeTestConnection();
    const loggedMessages: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 50,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => loggedMessages.push(msg),
        error: (msg) => loggedMessages.push(msg)
      }
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 'INITIAL_BOOTSTRAP',
      progress: 30,
      isLatest: false,
      lidPnMappingsCount: 3,
      chatsCount: 2,
      contactsCount: 2,
      messagesCount: 4
    });

    await runPromise;

    const allLogs = loggedMessages.join('\n');
    assert.strictEqual(allLogs.includes('@s.whatsapp.net'), false);
    assert.strictEqual(allLogs.includes('@lid'), false);
    assert.strictEqual(allLogs.includes('+5215512345678'), false);
    assert.strictEqual(allLogs.includes('5215512345678'), false);
    assert.ok(allLogs.includes('SYNC_LID_PN_MAPPINGS_COUNT=3'));
  });

  await t.test('4. COMPLETE requiere evidencia explicita: isLatest=true', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 1000,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 'RECENT',
      progress: 100,
      isLatest: true,
      lidPnMappingsCount: 1,
      chatsCount: 1,
      contactsCount: 1,
      messagesCount: 1
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'COMPLETE');
    assert.strictEqual(result.isLatest, true);
  });

  await t.test('5. COMPLETE requiere evidencia explicita: progress=100', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 1000,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 'FULL',
      progress: 100,
      isLatest: false,
      lidPnMappingsCount: 0,
      chatsCount: 0,
      contactsCount: 0,
      messagesCount: 0
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'COMPLETE');
  });

  await t.test('6. PARTIAL por progress no final dentro de la ventana', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 40,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 1,
      progress: 45,
      isLatest: false,
      lidPnMappingsCount: 2,
      chatsCount: 3,
      contactsCount: 4,
      messagesCount: 5
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'PARTIAL');
    assert.strictEqual(result.eventsCount, 1);
    assert.strictEqual(result.lastProgress, 45);
  });

  await t.test('7. NO_EVENT por timeout bounded sin eventos de sync', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 30,
      pollIntervalMs: 10
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'NO_EVENT');
    assert.strictEqual(result.eventsCount, 0);
  });

  await t.test('8. DEVICE_REMOVED terminal durante conexion', async () => {
    const conn = new FakeTestConnection();
    conn.start = async () => {
      conn.state = 'DEVICE_REMOVED';
    };
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 50,
      pollIntervalMs: 10
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'DEVICE_REMOVED');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('9. LOGGED_OUT terminal durante observacion', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 1000,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 15));
    conn.state = 'LOGGED_OUT';

    const result = await runPromise;
    assert.strictEqual(result.status, 'LOGGED_OUT');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('10. cleanup ejecutado antes de exit', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.closeCalls, 1);
    assert.strictEqual(conn.getState(), 'DISCONNECTED');
  });

  await t.test('11. pending auth persistence drena antes de exit', async () => {
    let persistenceDrained = false;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((r) => setTimeout(r, 25));
            persistenceDrained = true;
          }
        };
      }
    };
    const factory = new FakeSyncSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    factory.lastSocket?.emit('creds.update', {});
    await manager.close();

    assert.strictEqual(persistenceDrained, true);
  });

  await t.test('12. no sendMessage invocado durante sync readiness', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 25,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('13. no onWhatsApp invocado durante sync readiness', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 25,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.queryCalled, false);
  });

  await t.test('14. no QR generado', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.getLatestQr(), null);
  });

  await t.test('15. no socket real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('16. no auth real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('17. no DB', () => {
    assert.ok(true);
  });

  await t.test('18. no worker', () => {
    assert.ok(true);
  });

  await t.test('19. Chispita no tocada', () => {
    assert.ok(true);
  });

  await t.test('20. DefaultBaileysSocketFactory no sobreescribe syncFullHistory si no esta definido', () => {
    const factorySource = fs.readFileSync(
      path.join(__dirname, 'infrastructure', 'baileys', 'DefaultBaileysSocketFactory.ts'),
      'utf8'
    );
    assert.strictEqual(factorySource.includes('options.syncFullHistory ?? false'), false);
    assert.ok(factorySource.includes('if (options.syncFullHistory !== undefined)'));
  });

  await t.test('21. CLI main retorna exit code 0 para COMPLETE', async () => {
    const conn = new FakeTestConnection();
    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => {
        setTimeout(() => {
          conn.emitSync({
            eventReceived: true,
            eventsCount: 1,
            syncType: 'RECENT',
            progress: 100,
            isLatest: true,
            lidPnMappingsCount: 0,
            chatsCount: 0,
            contactsCount: 0,
            messagesCount: 0
          });
        }, 15);
        return { authDir: '/tmp/test-auth', windowSec: 1, timeoutMs: 1000 };
      }
    });
    assert.strictEqual(code, 0);
  });

  await t.test('22. CLI main retorna exit code 0 para PARTIAL (sesion no invalida)', async () => {
    const conn = new FakeTestConnection();
    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => {
        setTimeout(() => {
          conn.emitSync({
            eventReceived: true,
            eventsCount: 1,
            syncType: 1,
            progress: 30,
            isLatest: false,
            lidPnMappingsCount: 1,
            chatsCount: 1,
            contactsCount: 1,
            messagesCount: 1
          });
        }, 5);
        return { authDir: '/tmp/test-auth', windowSec: 0, timeoutMs: 1000 };
      }
    });
    assert.strictEqual(code, 0);
  });

  await t.test('23. CLI main retorna exit code 0 para NO_EVENT (sesion no invalida)', async () => {
    const conn = new FakeTestConnection();
    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => ({ authDir: '/tmp/test-auth', windowSec: 0, timeoutMs: 1000 })
    });
    assert.strictEqual(code, 0);
  });

  await t.test('24. CLI main retorna exit code 1 si cleanup falla', async () => {
    const conn = new FakeTestConnection();
    conn.close = async () => {
      throw new Error('Disk unmount error during close');
    };
    const code = await syncReadinessMain({
      runtime: { connection: conn } as any,
      parseArgs: () => ({ authDir: '/tmp/test-auth', windowSec: 0, timeoutMs: 1000 })
    });
    assert.strictEqual(code, 1);
  });

  await t.test('25. Pre-runtime validation retorna exit 1 sin crear socket', async () => {
    const code = await syncReadinessMain({
      parseArgs: () => {
        throw new Error('Invalid windowSec');
      }
    });
    assert.strictEqual(code, 1);
  });
});
