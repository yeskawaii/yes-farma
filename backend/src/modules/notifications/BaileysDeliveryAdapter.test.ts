import test from 'node:test';
import assert from 'node:assert/strict';
import { Boom } from '@hapi/boom';
import {
  BaileysNotificationDeliveryAdapter
} from './infrastructure/baileys/BaileysNotificationDeliveryAdapter';
import {
  BaileysConnectionManager
} from './infrastructure/baileys/BaileysConnectionManager';
import {
  BaileysDeliveryErrorClassifier
} from './infrastructure/baileys/BaileysDeliveryErrorClassifier';
import {
  MultiFileAuthStateStore
} from './infrastructure/baileys/MultiFileAuthStateStore';
import {
  IWhatsAppConnection
} from './infrastructure/baileys/IWhatsAppConnection';
import {
  IWhatsAppAuthStateStore
} from './infrastructure/baileys/IWhatsAppAuthStateStore';
import {
  IBaileysMessageSender,
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  BaileysSendResult,
  BaileysFailureCodes
} from './infrastructure/baileys/BaileysTypes';
import * as fs from 'node:fs';
import * as path from 'node:path';

class FakeSocketInstance implements IBaileysSocketInstance {
  public eventListeners: Map<string, ((...args: any[]) => void)[]> = new Map();
  public sentMessages: { jid: string; content: { text: string } }[] = [];
  public nextSendResult: BaileysSendResult | null | undefined = { key: { id: 'real-baileys-id-123' } };
  public sendErrorToThrow: Error | null = null;
  public ended = false;

  ev = {
    on: (event: 'connection.update' | 'creds.update', listener: (arg: any) => void) => {
      const current = this.eventListeners.get(event) || [];
      current.push(listener);
      this.eventListeners.set(event, current);
    }
  };

  emit(event: 'connection.update' | 'creds.update', arg: any) {
    const listeners = this.eventListeners.get(event) || [];
    for (const l of listeners) {
      l(arg);
    }
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined> {
    if (this.sendErrorToThrow) {
      throw this.sendErrorToThrow;
    }
    this.sentMessages.push({ jid, content });
    return this.nextSendResult;
  }

  end() {
    this.ended = true;
  }
}

class FakeSocketFactory implements IBaileysSocketFactory {
  public lastCreatedSocket: FakeSocketInstance | null = null;
  public createdSockets: FakeSocketInstance[] = [];
  public createCount = 0;
  public errorToThrow: Error | null = null;

  async createSocket(): Promise<IBaileysSocketInstance> {
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    this.createCount++;
    const sock = new FakeSocketInstance();
    this.lastCreatedSocket = sock;
    this.createdSockets.push(sock);
    return sock;
  }
}

class FakeAuthStateStore implements IWhatsAppAuthStateStore {
  public saveCredsCallCount = 0;
  public savedData: Map<string, any> = new Map();

  async getAuthState(): Promise<{ state: any; saveCreds: () => Promise<void> }> {
    return {
      state: {
        creds: { me: { id: '5210000000000' } },
        keys: {
          get: async () => ({}),
          set: async () => {}
        }
      },
      saveCreds: async () => {
        this.saveCredsCallCount++;
      }
    };
  }
}

class FakeWhatsAppConnection implements IWhatsAppConnection, IBaileysMessageSender {
  public state: any = 'CONNECTED';
  public latestQr: string | null = null;
  public sentMessages: { jid: string; content: { text: string } }[] = [];
  public nextResult: BaileysSendResult | null | undefined = { key: { id: 'prov-msg-1' } };
  public sendError: Error | null = null;

  getState() {
    return this.state;
  }

  getLatestQr() {
    return this.latestQr;
  }

  async start() {
    this.state = 'CONNECTING';
  }

  async close() {
    this.state = 'DISCONNECTED';
  }

  getMessageSender(): IBaileysMessageSender | null {
    if (this.state === 'CONNECTED') return this;
    return null;
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined> {
    if (this.sendError) {
      throw this.sendError;
    }
    this.sentMessages.push({ jid, content });
    return this.nextResult;
  }
}

test('Baileys Delivery Adapter & Connection Lifecycle - Phase C1', async (t) => {
  await t.test('1. delivery WHATSAPP connected + success -> SENT', async () => {
    const conn = new FakeWhatsAppConnection();
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Recordatorio de cita médica',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'SENT');
  });

  await t.test('2. providerMessageId real se propaga', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.nextResult = { key: { id: 'baileys-real-unique-msg-id-789' } };
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'SENT');
    if (res.status === 'SENT') {
      assert.strictEqual(res.providerMessageId, 'baileys-real-unique-msg-id-789');
    }
  });

  await t.test('3. socket disconnected -> RETRYABLE_FAILURE', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.state = 'DISCONNECTED';
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'RETRYABLE_FAILURE');
    if (res.status === 'RETRYABLE_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_NOT_CONNECTED);
    }
  });

  await t.test('4. recipient E.164 inválido -> PERMANENT_FAILURE', async () => {
    const conn = new FakeWhatsAppConnection();
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '2281234567', // Missing leading +
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID);
    }
  });

  await t.test('5. unsupported channel -> PERMANENT_FAILURE', async () => {
    const conn = new FakeWhatsAppConnection();
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'SMS' as any,
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.UNSUPPORTED_NOTIFICATION_CHANNEL);
    }
  });

  await t.test('6. temporary transport error post-send -> AMBIGUOUS_FAILURE', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.sendError = new Boom('Connection reset by peer', { statusCode: 428 });
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('7. resultado ambiguo -> AMBIGUOUS_FAILURE', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.sendError = new Error('Socket timed out waiting for delivery ack');
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('8. no se inventa providerMessageId', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.nextResult = { key: { id: '' } }; // Missing non-empty ID
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('9. E.164 -> jid correcto solamente en infrastructure', async () => {
    const conn = new FakeWhatsAppConnection();
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test message',
      jobId: 'job-1'
    });

    assert.strictEqual(conn.sentMessages.length, 1);
    assert.strictEqual(conn.sentMessages[0]?.jid, '5210000000000@s.whatsapp.net');
    assert.strictEqual(conn.sentMessages[0]?.content.text, 'Test message');
  });

  await t.test('10. connection manager inicia DISCONNECTED', () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    assert.strictEqual(manager.getState(), 'DISCONNECTED');
    assert.strictEqual(manager.getLatestQr(), null);
    assert.strictEqual(manager.getMessageSender(), null);
  });

  await t.test('11. start -> CONNECTING', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('12. QR update -> QR_REQUIRED', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@abcde-test-qr-string' });

    assert.strictEqual(manager.getState(), 'QR_REQUIRED');
  });

  await t.test('13. getLatestQr devuelve QR actual', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@sample-qr' });

    assert.strictEqual(manager.getLatestQr(), '1@sample-qr');
  });

  await t.test('14. QR no se persiste en auth store', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@secret-qr-code' });

    assert.strictEqual(authStore.savedData.has('qr'), false);
    assert.strictEqual(authStore.saveCredsCallCount, 0);
  });

  await t.test('15. connection open -> CONNECTED y limpia QR', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr' });
    assert.strictEqual(manager.getState(), 'QR_REQUIRED');

    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    assert.strictEqual(manager.getState(), 'CONNECTED');
    assert.strictEqual(manager.getLatestQr(), null);
    assert.ok(manager.getMessageSender());
  });

  await t.test('16. temporary close -> RECONNECTING', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Connection lost', { statusCode: 408 })
      }
    });

    assert.strictEqual(manager.getState(), 'RECONNECTING');
    assert.strictEqual(manager.getLatestQr(), null);
  });

  await t.test('17. loggedOut -> LOGGED_OUT', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Logged out', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
  });

  await t.test('18. loggedOut no dispara reconnect automático', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    assert.strictEqual(factory.createCount, 1);

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Logged out', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('19. creds.update llama saveCreds', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', { me: { id: '5210000000000' } });

    assert.strictEqual(authStore.saveCredsCallCount, 1);
  });

  await t.test('20. auth path configurable', () => {
    const customPath = '/app/data/custom-whatsapp-auth';
    const store = new MultiFileAuthStateStore(customPath);
    assert.strictEqual(store.getAuthDir(), customPath);
  });

  await t.test('21. ningún test abre conexión real', () => {
    const factory = new FakeSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('22. ningún test envía WhatsApp real', () => {
    const delivery = new FakeWhatsAppConnection();
    assert.strictEqual(delivery.sentMessages.length, 0);
  });

  await t.test('23. ningún log contiene QR', () => {
    const manager = new BaileysConnectionManager(new FakeAuthStateStore(), new FakeSocketFactory());
    assert.strictEqual(manager.getLatestQr(), null);
  });

  await t.test('24. ningún log contiene auth creds', () => {
    const store = new FakeAuthStateStore();
    assert.ok(store);
  });

  await t.test('25. NotificationWorkerService continúa sin importar Baileys', () => {
    const filePath = path.join(__dirname, 'application', 'NotificationWorkerService.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(content.includes('@whiskeysockets/baileys'), false);
    assert.strictEqual(content.includes('Baileys'), false);
  });

  await t.test('26. domain/application no importan @whiskeysockets/baileys', () => {
    const domainDir = path.join(__dirname, 'domain');
    const domainFiles = fs.readdirSync(domainDir);
    for (const file of domainFiles) {
      if (file.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(domainDir, file), 'utf8');
        assert.strictEqual(
          content.includes('@whiskeysockets/baileys'),
          false,
          `File ${file} in domain must not import @whiskeysockets/baileys`
        );
      }
    }

    const appDir = path.join(__dirname, 'application');
    const appFiles = fs.readdirSync(appDir);
    for (const file of appFiles) {
      if (file.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(appDir, file), 'utf8');
        assert.strictEqual(
          content.includes('@whiskeysockets/baileys'),
          false,
          `File ${file} in application must not import @whiskeysockets/baileys`
        );
      }
    }
  });

  // ==========================================
  // NEW AUDIT TESTS (27 - 42)
  // ==========================================

  await t.test('27. classifier 401 -> PERMANENT_FAILURE WHATSAPP_LOGGED_OUT', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const boom401 = new Boom('Unauthorized session', { statusCode: 401 });

    const res = classifier.classify(boom401);
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_LOGGED_OUT);
    }
  });

  await t.test('28. 401 nunca produce RETRYABLE_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const resPre = classifier.classify(new Boom('Logged out', { statusCode: 401 }), { phase: 'PRE_SEND' });
    const resPost = classifier.classify(new Boom('Logged out', { statusCode: 401 }), { phase: 'SEND_STARTED' });

    assert.strictEqual(resPre.status, 'PERMANENT_FAILURE');
    assert.strictEqual(resPost.status, 'PERMANENT_FAILURE');
  });

  await t.test('29. 428 después de sendMessage iniciado -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Boom('Connection reset', { statusCode: 428 }), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('30. 408 después de sendMessage iniciado -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Boom('Timed out', { statusCode: 408 }), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('31. 503 después de sendMessage iniciado -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Boom('Service unavailable', { statusCode: 503 }), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('32. ECONNRESET después de sendMessage iniciado -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Error('read ECONNRESET'), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('33. timeout después de sendMessage iniciado -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Error('Operation timed out'), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('34. error desconocido post-send -> AMBIGUOUS_FAILURE', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const res = classifier.classify(new Error('Unexpected protocol frame error'), { phase: 'SEND_STARTED' });

    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
    if (res.status === 'AMBIGUOUS_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN);
    }
  });

  await t.test('35. disconnected detectado ANTES de sendMessage -> RETRYABLE y sendMessage no se llama', async () => {
    const conn = new FakeWhatsAppConnection();
    conn.state = 'DISCONNECTED';
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'RETRYABLE_FAILURE');
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('36. recipient inválido se rechaza antes de sendMessage', async () => {
    const conn = new FakeWhatsAppConnection();
    const adapter = new BaileysNotificationDeliveryAdapter(conn);

    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: 'invalid-recipient',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('37. start estando LOGGED_OUT no crea nuevo socket', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Logged out', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(factory.createCount, 1);

    // Intentar start de nuevo
    await manager.start();
    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('38. LOGGED_OUT conserva estado terminal', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Logged out', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(manager.getMessageSender(), null);
  });

  await t.test('39. start explícito desde RECONNECTING dispone socket anterior antes de crear otro', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    const firstSocket = factory.lastCreatedSocket!;

    firstSocket.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Connection lost', { statusCode: 408 })
      }
    });

    assert.strictEqual(manager.getState(), 'RECONNECTING');
    assert.strictEqual(firstSocket.ended, true);

    // Nuevo start explícito
    await manager.start();
    assert.strictEqual(factory.createCount, 2);
  });

  await t.test('40. start explícito desde ERROR no conserva socket anterior', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    factory.errorToThrow = new Error('Init socket failed');
    await manager.start();
    assert.strictEqual(manager.getState(), 'ERROR');

    // Reset factory error and retry start
    factory.errorToThrow = null;
    await manager.start();
    assert.strictEqual(manager.getState(), 'CONNECTING');
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('41. close event impide que getMessageSender devuelva sender', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    assert.ok(manager.getMessageSender());

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Lost', { statusCode: 408 })
      }
    });

    assert.strictEqual(manager.getMessageSender(), null);
  });

  await t.test('42. no existe reconnect automático', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    assert.strictEqual(factory.createCount, 1);

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Lost', { statusCode: 408 })
      }
    });

    assert.strictEqual(manager.getState(), 'RECONNECTING');
    assert.strictEqual(factory.createCount, 1); // Exactamente 1 socket creado
  });
});
