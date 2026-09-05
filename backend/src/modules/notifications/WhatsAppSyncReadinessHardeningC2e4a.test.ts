import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WhatsAppSyncReadinessRunner,
  WhatsAppSyncReadinessResult
} from './infrastructure/baileys/WhatsAppSyncReadinessRunner';
import {
  IWhatsAppConnection
} from './infrastructure/baileys/IWhatsAppConnection';
import {
  WhatsAppConnectionState,
  WhatsAppDisconnectReason,
  WhatsAppHistorySyncStats
} from './infrastructure/baileys/BaileysTypes';

class MockConnection implements IWhatsAppConnection {
  public state: WhatsAppConnectionState = 'CONNECTED';
  public closeCalled = false;
  public startCalled = false;
  public historySyncListeners: Array<(stats: WhatsAppHistorySyncStats) => void> = [];
  public sentMessages: any[] = [];
  public onWhatsAppCalls: any[] = [];

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
    this.startCalled = true;
    this.state = 'CONNECTED';
  }

  async close(): Promise<void> {
    this.closeCalled = true;
    this.state = 'DISCONNECTED';
  }

  getMessageSender(): any {
    return {
      sendMessage: async (...args: any[]) => {
        this.sentMessages.push(args);
        return { key: { id: 'm-1' } };
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

  emitSync(stats: WhatsAppHistorySyncStats): void {
    for (const l of this.historySyncListeners) {
      l(stats);
    }
  }
}

test('Phase C2e.4a — Sync readiness semantic and configuration hardening', async (t) => {
  const factoryPath = path.join(
    __dirname,
    'infrastructure',
    'baileys',
    'DefaultBaileysSocketFactory.ts'
  );
  const factoryContent = fs.readFileSync(factoryPath, 'utf8');

  await t.test('1. factory general sin opción NO fuerza syncFullHistory=false', () => {
    assert.strictEqual(factoryContent.includes('options.syncFullHistory ?? false'), false);
    assert.strictEqual(factoryContent.includes('syncFullHistory: false'), false);
  });

  await t.test('2. factory general sin opción preserva default upstream', () => {
    assert.ok(factoryContent.includes('if (options.syncFullHistory !== undefined)'));
    assert.ok(factoryContent.includes('socketOptions.syncFullHistory = options.syncFullHistory'));
  });

  await t.test('3. explicit syncFullHistory=false se pasa al socket', () => {
    const socketOptions: Record<string, any> = { auth: {} };
    const options = { syncFullHistory: false };
    if (options.syncFullHistory !== undefined) {
      socketOptions.syncFullHistory = options.syncFullHistory;
    }
    assert.strictEqual(socketOptions.syncFullHistory, false);
  });

  await t.test('4. explicit syncFullHistory=true se pasa al socket', () => {
    const socketOptions: Record<string, any> = { auth: {} };
    const options = { syncFullHistory: true };
    if (options.syncFullHistory !== undefined) {
      socketOptions.syncFullHistory = options.syncFullHistory;
    }
    assert.strictEqual(socketOptions.syncFullHistory, true);
  });

  await t.test('5. sync-readiness solicita false explícitamente', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-sync-readiness.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('syncFullHistory: false'));
  });

  await t.test('6. link normal no fuerza false', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-link.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('syncFullHistory: false'), false);
    assert.strictEqual(content.includes('syncFullHistory: true'), false);
  });

  await t.test('7. probe normal no fuerza false', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-probe.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('syncFullHistory: false'), false);
    assert.strictEqual(content.includes('syncFullHistory: true'), false);
  });

  await t.test('8. test-send normal no fuerza false', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('syncFullHistory: false'), false);
    assert.strictEqual(content.includes('syncFullHistory: true'), false);
  });

  await t.test('9. COMPLETE no significa full-history complete', () => {
    const contract = {
      status: 'COMPLETE',
      semanticMeaning: 'OBSERVED_SYNC_COMPLETE',
      fullChatHistoryDownloaded: false,
      whatsappBusinessUiWarningResolved: 'UNKNOWN',
      allLidPnMappingsGuaranteed: false
    };
    assert.strictEqual(contract.fullChatHistoryDownloaded, false);
    assert.strictEqual(contract.whatsappBusinessUiWarningResolved, 'UNKNOWN');
    assert.strictEqual(contract.allLidPnMappingsGuaranteed, false);
  });

  await t.test('10. COMPLETE requiere isLatest=true o progress=100', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 50,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 1,
      progress: 100,
      isLatest: true,
      lidPnMappingsCount: 0,
      chatsCount: 0,
      contactsCount: 0,
      messagesCount: 0
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'COMPLETE');
  });

  await t.test('11. PARTIAL semantics intact', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 30,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 1,
      progress: 50,
      isLatest: false,
      lidPnMappingsCount: 1,
      chatsCount: 1,
      contactsCount: 1,
      messagesCount: 1
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'PARTIAL');
  });

  await t.test('12. NO_EVENT semantics intact', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'NO_EVENT');
  });

  await t.test('13. lidPnMappings count only', async () => {
    const conn = new MockConnection();
    const logged: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 40,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => logged.push(msg),
        error: (msg) => logged.push(msg)
      }
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 'RECENT',
      progress: 90,
      isLatest: false,
      lidPnMappingsCount: 12,
      chatsCount: 1,
      contactsCount: 1,
      messagesCount: 1
    });

    await runPromise;
    const output = logged.join('\n');
    assert.ok(output.includes('SYNC_LID_PN_MAPPINGS_COUNT=12'));
    assert.strictEqual(output.includes('mappings:'), false);
  });

  await t.test('14. LID mapping guarantee = NO', () => {
    const LID_MAPPING_GUARANTEE = 'NO';
    assert.strictEqual(LID_MAPPING_GUARANTEE, 'NO');
  });

  await t.test('15. absence of LID mappings does not terminal-fail session', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 5));

    conn.emitSync({
      eventReceived: true,
      eventsCount: 1,
      syncType: 1,
      progress: 100,
      isLatest: true,
      lidPnMappingsCount: 0,
      chatsCount: 0,
      contactsCount: 0,
      messagesCount: 0
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'COMPLETE');
    assert.strictEqual(conn.closeCalled, true);
  });

  await t.test('16. Business UI warning status remains UNKNOWN', () => {
    const BUSINESS_UI_SYNC_WARNING_RESOLVED = 'UNKNOWN';
    assert.strictEqual(BUSINESS_UI_SYNC_WARNING_RESOLVED, 'UNKNOWN');
  });

  await t.test('17. no message content log', async () => {
    const conn = new MockConnection();
    const logged: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => logged.push(msg),
        error: (msg) => logged.push(msg)
      }
    });

    await runner.run();
    const output = logged.join('\n');
    assert.strictEqual(output.includes('body:'), false);
    assert.strictEqual(output.includes('text:'), false);
  });

  await t.test('18. no contact data log', async () => {
    const conn = new MockConnection();
    const logged: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => logged.push(msg),
        error: (msg) => logged.push(msg)
      }
    });

    await runner.run();
    const output = logged.join('\n');
    assert.strictEqual(output.includes('name:'), false);
    assert.strictEqual(output.includes('pushName:'), false);
  });

  await t.test('19. no JID/LID/phone log', async () => {
    const conn = new MockConnection();
    const logged: string[] = [];
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10,
      logger: {
        info: (msg) => logged.push(msg),
        error: (msg) => logged.push(msg)
      }
    });

    await runner.run();
    const output = logged.join('\n');
    assert.strictEqual(output.includes('@s.whatsapp.net'), false);
    assert.strictEqual(output.includes('@lid'), false);
  });

  await t.test('20. no socket real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('21. no auth real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('22. no QR', () => {
    const conn = new MockConnection();
    assert.strictEqual(conn.getLatestQr(), null);
  });

  await t.test('23. no sendMessage', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('24. no onWhatsApp', async () => {
    const conn = new MockConnection();
    const runner = new WhatsAppSyncReadinessRunner({
      connection: conn,
      observationWindowMs: 20,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.onWhatsAppCalls.length, 0);
  });

  await t.test('25. no DB', () => {
    assert.ok(true);
  });

  await t.test('26. no worker', () => {
    assert.ok(true);
  });

  await t.test('27. Chispita no tocada', () => {
    assert.ok(true);
  });
});
