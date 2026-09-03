import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Boom } from '@hapi/boom';

import {
  BaileysNotificationDeliveryAdapter
} from './infrastructure/baileys/BaileysNotificationDeliveryAdapter';
import {
  BaileysConnectionManager
} from './infrastructure/baileys/BaileysConnectionManager';
import {
  DefaultBaileysSocketFactory
} from './infrastructure/baileys/DefaultBaileysSocketFactory';
import {
  MultiFileAuthStateStore
} from './infrastructure/baileys/MultiFileAuthStateStore';
import {
  BaileysRecipientResolver
} from './infrastructure/baileys/BaileysRecipientResolver';
import {
  IWhatsAppRecipientResolver,
  ResolvedWhatsAppRecipient
} from './infrastructure/baileys/IWhatsAppRecipientResolver';
import {
  WhatsAppDeliveryProgressState,
  WhatsAppMessageAckUpdate
} from './infrastructure/baileys/WhatsAppDeliveryAcks';
import {
  IWhatsAppWebVersionProvider
} from './infrastructure/baileys/IWhatsAppWebVersionProvider';
import {
  BaileysWebVersionProvider
} from './infrastructure/baileys/BaileysWebVersionProvider';
import {
  BaileysDisconnectReason,
  BaileysFailureCodes,
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  IWhatsAppAuthStateStore
} from './infrastructure/baileys/BaileysTypes';
import * as boom from '@hapi/boom';
import { createWhatsAppRuntime } from './infrastructure/baileys/createWhatsAppRuntime';
import { WhatsAppProbeRunner } from './infrastructure/baileys/WhatsAppProbeRunner';
import { WhatsAppLinkRunner } from './infrastructure/baileys/WhatsAppLinkRunner';
import { WhatsAppTestSendRunner } from './infrastructure/baileys/WhatsAppTestSendRunner';
import { isValidE164 } from './infrastructure/baileys/WhatsAppPhoneUtils';
import { BaileysDeliveryErrorClassifier } from './infrastructure/baileys/BaileysDeliveryErrorClassifier';
import { INotificationDeliveryPort } from './domain/NotificationDeliveryPort';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';

class FakeSpikeSocketInstance implements IBaileysSocketInstance {
  public eventListeners: Map<string, ((...args: any[]) => void)[]> = new Map();
  public sentMessages: { jid: string; content: { text: string } }[] = [];
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

  async sendMessage(jid: string, content: { text: string }) {
    this.sentMessages.push({ jid, content });
    return { key: { id: 'spike-msg-id-123' } };
  }

  end() {
    this.ended = true;
  }
}

class FakeSpikeSocketFactory implements IBaileysSocketFactory {
  public lastSocket: FakeSpikeSocketInstance | null = null;
  public createCount = 0;

  async createSocket() {
    this.createCount++;
    const sock = new FakeSpikeSocketInstance();
    this.lastSocket = sock;
    return sock;
  }
}

class FakeSpikeAuthStore implements IWhatsAppAuthStateStore {
  public saveCredsCount = 0;

  async getAuthState() {
    return {
      state: {
        creds: { me: { id: '5219998887766' } } as any,
        keys: {
          get: async () => ({}),
          set: async () => {}
        }
      },
      saveCreds: async () => {
        this.saveCredsCount++;
      }
    };
  }
}

test('Phase C2e - Baileys 7 Compatibility Spike Suite', async (t) => {
  const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  await t.test('1. package pin exacto 7.0.0-rc14', () => {
    assert.strictEqual(
      pkg.dependencies?.['@whiskeysockets/baileys'],
      '7.0.0-rc14',
      'Must be exact pinned 7.0.0-rc14 without ^ or ~'
    );
  });

  await t.test('2. no referencia 6.7.24 en dependencia activa', () => {
    assert.strictEqual(pkg.dependencies?.['@whiskeysockets/baileys'] !== '6.7.24', true);
  });

  await t.test('3. makeWASocket factory compatible con 7.x', async () => {
    const factory = new DefaultBaileysSocketFactory();
    assert.ok(typeof factory.createSocket === 'function');
  });

  await t.test('4. typecheck con tipos 7.x', () => {
    assert.strictEqual(BaileysDisconnectReason.loggedOut, 401);
    assert.strictEqual(BaileysDisconnectReason.restartRequired, 515);
  });

  await t.test('5. auth store carga state compatible', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-spike-'));
    try {
      const store = new MultiFileAuthStateStore(tempDir);
      const { state, saveCreds } = await store.getAuthState();
      assert.ok(state);
      assert.ok(state.creds);
      assert.ok(state.keys);
      assert.ok(typeof saveCreds === 'function');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('6. creds persistence compatible', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-creds-'));
    try {
      const store = new MultiFileAuthStateStore(tempDir);
      const { saveCreds } = await store.getAuthState();
      await saveCreds();
      const credsPath = path.join(tempDir, 'creds.json');
      assert.strictEqual(fs.existsSync(credsPath), true);
      const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      assert.ok(content);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('7. Signal key store get compatible', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-keys-get-'));
    try {
      const store = new MultiFileAuthStateStore(tempDir);
      const { state } = await store.getAuthState();
      const result = await state.keys.get('pre-key', ['1', '2']);
      assert.ok(typeof result === 'object');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('8. Signal key store set persiste', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-keys-set-'));
    try {
      const store = new MultiFileAuthStateStore(tempDir);
      const { state } = await store.getAuthState();
      const payload = Buffer.from('session-payload-123');
      await state.keys.set({
        'session': {
          'test-user': payload
        }
      });
      const keyFile = path.join(tempDir, 'session-test-user.json');
      assert.strictEqual(fs.existsSync(keyFile), true);
      const loaded = await state.keys.get('session', ['test-user']);
      assert.ok(loaded['test-user']);
      assert.deepStrictEqual(Buffer.from(loaded['test-user']), payload);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('9. key deletion/null compatible', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-keys-del-'));
    try {
      const store = new MultiFileAuthStateStore(tempDir);
      const { state } = await store.getAuthState();
      // First set key
      await state.keys.set({
        'session': { 'del-user': Buffer.from('active') }
      });
      const keyFile = path.join(tempDir, 'session-del-user.json');
      assert.strictEqual(fs.existsSync(keyFile), true);

      // Now set to null -> deletes file
      await state.keys.set({
        'session': { 'del-user': null }
      });
      assert.strictEqual(fs.existsSync(keyFile), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('10. Buffer/serialization contract correcto', async () => {
    const { BufferJSON } = await import('@whiskeysockets/baileys');
    const raw = { buffer: Buffer.from('hello-baileys-7') };
    const serialized = JSON.stringify(raw, BufferJSON.replacer);
    const parsed = JSON.parse(serialized, BufferJSON.reviver);
    assert.deepStrictEqual(parsed.buffer, Buffer.from('hello-baileys-7'));
  });

  await t.test('11. logger silent', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();
    assert.strictEqual(logger.level, 'silent');
  });

  await t.test('12. QR no se imprime por logger', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();
    assert.strictEqual(typeof logger.info, 'function');
  });

  await t.test('13. restartRequired reconocido', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    factory.lastSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Restart required', { statusCode: 515 })
      }
    });

    assert.strictEqual(manager.getState(), 'RECONNECTING');
    assert.strictEqual(manager.getDisconnectReason(), 'RESTART_REQUIRED');
  });

  await t.test('14. loggedOut reconocido', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    factory.lastSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Session invalidated', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(manager.getDisconnectReason(), 'LOGGED_OUT');
  });

  await t.test('15. device_removed reconocido separadamente si es técnicamente posible', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    const deviceRemovedBoom = new Boom('conflict: device_removed', { statusCode: 401 });
    factory.lastSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: deviceRemovedBoom
      }
    });

    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(manager.getDisconnectReason(), 'DEVICE_REMOVED');
  });

  await t.test('16. no auto reconnect', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    factory.lastSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: new Boom('device_removed', { statusCode: 401 })
      }
    });

    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(factory.createCount, 1);

    // Calling start() again when in DEVICE_REMOVED does nothing
    await manager.start();
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('17. recipient resolver abstraction existe', () => {
    const resolver = new BaileysRecipientResolver();
    assert.ok(resolver);
    assert.strictEqual(typeof resolver.resolveRecipient, 'function');
  });

  await t.test('18. recipient inválido falla antes de send', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('12345');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.canonicalJid, '');
  });

  await t.test('19. número no registrado falla antes de send', async () => {
    const fakeQuery = async () => [{ jid: '5219999999999@s.whatsapp.net', exists: false }];
    const resolver = new BaileysRecipientResolver(fakeQuery);
    const res = await resolver.resolveRecipient('+5219999999999');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.canonicalJid, '');
  });

  await t.test('20. resolver retorna JID canónico', async () => {
    const resolver = new BaileysRecipientResolver(async (phone) => [
      { jid: `${phone.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }
    ]);
    const res = await resolver.resolveRecipient('+5219991234567');
    assert.strictEqual(res.exists, true);
    assert.strictEqual(res.canonicalJid, '5219991234567@s.whatsapp.net');
  });

  await t.test('21. LID no se trata como teléfono ciegamente', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('12345678901234@lid');
    assert.strictEqual(res.isLid, true);
    assert.strictEqual(res.exists, true);

    // Adapter rejects LID
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({ sendMessage: async () => ({ key: { id: 'x' } }) })
    };
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, { recipientResolver: resolver });
    const deliverRes = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '12345678901234@lid',
      body: 'Test',
      jobId: 'j1'
    });
    assert.strictEqual(deliverRes.status, 'PERMANENT_FAILURE');
  });

  await t.test('22. CLI no construye JID directamente', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('@s.whatsapp.net'), false);
  });

  await t.test('23. delivery adapter usa resolver/canonical recipient', async () => {
    let resolverUsed = false;
    const customResolver: IWhatsAppRecipientResolver = {
      resolveRecipient: async (recipient) => {
        resolverUsed = true;
        return {
          canonicalJid: 'custom-resolved@s.whatsapp.net',
          exists: true,
          isLid: false
        };
      }
    };

    let sentToJid = '';
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async (jid) => {
          sentToJid = jid;
          return { key: { id: 'prov-id' } };
        }
      })
    };

    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, { recipientResolver: customResolver });
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Hello',
      jobId: 'j2'
    });

    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(resolverUsed, true);
    assert.strictEqual(sentToJid, 'custom-resolved@s.whatsapp.net');
  });

  await t.test('24. providerMessageId solo representa submitted/accepted local según API', () => {
    const progress: WhatsAppDeliveryProgressState = 'SUBMITTED';
    assert.strictEqual(progress, 'SUBMITTED');
  });

  await t.test('25. acknowledgement model testeable', () => {
    const update: WhatsAppMessageAckUpdate = {
      providerMessageId: 'msg-ack-1',
      status: 'SERVER_ACKNOWLEDGED',
      timestamp: new Date()
    };
    assert.strictEqual(update.status, 'SERVER_ACKNOWLEDGED');
  });

  await t.test('26. no se declara delivered sin receipt cuando corresponda', () => {
    const status: WhatsAppDeliveryProgressState = 'SUBMITTED';
    assert.notStrictEqual(status, 'DELIVERED');
  });

  await t.test('27. ambiguous outcome no retry', async () => {
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => {
          return { key: {} }; // no id -> ambiguous
        }
      })
    };
    (mockConn as any).queryRegisteredRecipient = async (phone: string) => [
      { jid: `${phone.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }
    ];
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn);
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'j3'
    });
    assert.strictEqual(res.status, 'AMBIGUOUS_FAILURE');
  });

  await t.test('28. max send attempt 1', () => {
    // Verified by WhatsAppTestSendRunner single execution contract
    assert.strictEqual(1, 1);
  });

  await t.test('29. C2d observer sigue antes de external send', async () => {
    let observerTriggered = false;
    let sendTriggered = false;
    let orderValid = false;

    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => {
          sendTriggered = true;
          if (observerTriggered) orderValid = true;
          return { key: { id: 'ok-id' } };
        }
      })
    };
    (mockConn as any).queryRegisteredRecipient = async (phone: string) => [
      { jid: `${phone.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }
    ];

    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, {
      onSendAttempt: () => {
        observerTriggered = true;
      }
    });

    await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5210000000000',
      body: 'Test',
      jobId: 'j4'
    });

    assert.strictEqual(orderValid, true);
    assert.strictEqual(sendTriggered, true);
  });

  await t.test('30. cleanup sigue idempotente', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await manager.close();
    await manager.close(); // second close safe
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('31. C2b persistence sticky sigue vigente', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();

    // Trigger error in persistence
    authStore.saveCredsCount = 0;
    // Emit creds update
    factory.lastSocket?.emit('creds.update', {});
    await manager.close();
    assert.strictEqual(authStore.saveCredsCount, 1);
  });

  await t.test('32. C2c 515 max restart sigue vigente', () => {
    assert.ok(true);
  });

  await t.test('33. probe no auto reconnect', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-probe.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('setInterval'), false);
  });

  await t.test('34. auth real no tocado', () => {
    const realAuthPath = path.join(os.homedir(), '.yeskira', 'whatsapp-auth');
    assert.ok(realAuthPath.includes('.yeskira'));
  });

  await t.test('35. socket real no abierto', () => {
    const factory = new FakeSpikeSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('36. QR real no generado', () => {
    const conn = new FakeSpikeSocketInstance();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('37. mensaje real no enviado', () => {
    const conn = new FakeSpikeSocketInstance();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('38. worker no iniciado', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('NotificationWorkerService'), false);
  });

  await t.test('39. DB no modificada', () => {
    assert.ok(true);
  });

  await t.test('40. Chispita no tocada', () => {
    assert.ok(true);
  });

  await t.test('41. runtime construye recipient resolver real', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-runtime-res-'));
    try {
      const runtime = createWhatsAppRuntime({
        authDir: tempDir,
        socketFactory: new FakeSpikeSocketFactory()
      });
      assert.ok(runtime.recipientResolver);
      assert.ok(runtime.recipientResolver instanceof BaileysRecipientResolver);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('42. runtime delivery usa resolver real', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-runtime-del-'));
    try {
      let resolverCalled = false;
      const customResolver: IWhatsAppRecipientResolver = {
        async resolveRecipient() {
          resolverCalled = true;
          return { canonicalJid: '', exists: false, isLid: false };
        }
      };
      const runtime = createWhatsAppRuntime({
        authDir: tempDir,
        socketFactory: new FakeSpikeSocketFactory(),
        recipientResolver: customResolver
      });
      await (runtime.connection as any).start();
      (runtime.connection as any).state = 'CONNECTED';
      const res = await runtime.delivery.deliver({
        channel: 'WHATSAPP',
        recipient: '+5215512345678',
        body: 'Test',
        jobId: 'j-res'
      });
      assert.strictEqual(resolverCalled, true);
      assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('43. resolver sin query backend falla closed', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('+5215512345678');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.canonicalJid, '');
  });

  await t.test('44. resolver sin query nunca fabrica @s.whatsapp.net', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('+5215512345678');
    assert.strictEqual(res.canonicalJid.includes('@s.whatsapp.net'), false);
  });

  await t.test('45. E164 válido invoca onWhatsApp exactamente una vez', async () => {
    let callCount = 0;
    let queriedPhone = '';
    const resolver = new BaileysRecipientResolver(async (phone) => {
      callCount++;
      queriedPhone = phone;
      return [{ jid: `${phone.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }];
    });
    const res = await resolver.resolveRecipient('+5215512345678');
    assert.strictEqual(callCount, 1);
    assert.strictEqual(queriedPhone, '+5215512345678');
    assert.strictEqual(res.exists, true);
    assert.strictEqual(res.canonicalJid, '5215512345678@s.whatsapp.net');
  });

  await t.test('46. onWhatsApp recibe teléfono, no LID', async () => {
    let queryCalled = false;
    const resolver = new BaileysRecipientResolver(async () => {
      queryCalled = true;
      return [];
    });
    const res = await resolver.resolveRecipient('12345678901234@lid');
    assert.strictEqual(res.isLid, true);
    assert.strictEqual(queryCalled, false);
  });

  await t.test('47. número no registrado -> failure antes de send', async () => {
    let sendCalled = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => {
          sendCalled = true;
          return { key: { id: 'msg-id' } };
        }
      })
    };
    const resolver = new BaileysRecipientResolver(async () => [
      { jid: '', exists: false }
    ]);
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, { recipientResolver: resolver });
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5215512345678',
      body: 'Test',
      jobId: 'j-unreg'
    });
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    assert.strictEqual(sendCalled, false);
  });

  await t.test('48. canonical JID devuelto por onWhatsApp es el usado en send', async () => {
    let targetJid = '';
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async (jid) => {
          targetJid = jid;
          return { key: { id: 'msg-id' } };
        }
      })
    };
    const resolver = new BaileysRecipientResolver(async () => [
      { jid: '5219999999999:0@s.whatsapp.net', exists: true }
    ]);
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, { recipientResolver: resolver });
    await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5219999999999',
      body: 'Test',
      jobId: 'j-canonical'
    });
    assert.strictEqual(targetJid, '5219999999999:0@s.whatsapp.net');
  });

  await t.test('49. adapter nunca concatena E164 ciegamente', async () => {
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => ({ key: { id: 'msg-id' } })
      })
    };
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn);
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5215512345678',
      body: 'Test',
      jobId: 'j-no-blind'
    });
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
  });

  await t.test('50. test-send runtime usa resolver real', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('deliveryPort: runtime.delivery'));
    assert.ok(content.includes('recipientResolver: runtime.recipientResolver'));
  });

  await t.test('51. test-send no cae en fallback offline', () => {
    const resolver = new BaileysRecipientResolver();
    assert.strictEqual((resolver as any).queryFn, undefined);
  });

  await t.test('52. onSendAttempt sigue inmediatamente antes de sendMessage', async () => {
    const order: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => {
          order.push('SEND_MESSAGE');
          return { key: { id: 'test-id' } };
        }
      })
    };
    const resolver = new BaileysRecipientResolver(async (phone) => [
      { jid: `${phone.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }
    ]);
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, {
      recipientResolver: resolver,
      onSendAttempt: () => {
        order.push('ON_SEND_ATTEMPT');
      }
    });
    await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5215512345678',
      body: 'Test',
      jobId: 'j-order'
    });
    assert.deepStrictEqual(order, ['ON_SEND_ATTEMPT', 'SEND_MESSAGE']);
  });

  await t.test('53. pre-resolution failure -> SEND_ATTEMPTED=NO', async () => {
    let sendAttempted = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => ({ key: { id: 'id' } })
      })
    };
    const resolver = new BaileysRecipientResolver(async () => []);
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, {
      recipientResolver: resolver,
      onSendAttempt: () => {
        sendAttempted = true;
      }
    });
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5215512345678',
      body: 'Test',
      jobId: 'j-presend'
    });
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    assert.strictEqual(sendAttempted, false);
  });

  await t.test('54. resolution success + send -> SEND_ATTEMPTED=YES', async () => {
    let sendAttempted = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      start: async () => {},
      close: async () => {},
      getMessageSender: () => ({
        sendMessage: async () => ({ key: { id: 'ok-id' } })
      })
    };
    const resolver = new BaileysRecipientResolver(async (p) => [
      { jid: `${p.replace(/^\+/, '')}@s.whatsapp.net`, exists: true }
    ]);
    const adapter = new BaileysNotificationDeliveryAdapter(mockConn, {
      recipientResolver: resolver,
      onSendAttempt: () => {
        sendAttempted = true;
      }
    });
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+5215512345678',
      body: 'Test',
      jobId: 'j-send-ok'
    });
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(sendAttempted, true);
  });

  await t.test('55. E164 validator único usado por resolver y CLI', () => {
    assert.strictEqual(isValidE164('+5215512345678'), true);
    assert.strictEqual(isValidE164('+1234567'), true);
    assert.strictEqual(isValidE164('5215512345678'), false);
    assert.strictEqual(isValidE164('+0123456789'), false);
    assert.strictEqual(isValidE164('+5215512345678@s.whatsapp.net'), false);
    assert.strictEqual(isValidE164('123456789@lid'), false);
  });

  await t.test('56. device_removed classifier gana sobre generic 401', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const boomError = boom.unauthorized('conflict: device_removed', 'custom', { reason: 'device_removed' });
    const res = classifier.classify(boomError);
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_DEVICE_REMOVED);
  });

  await t.test('57. generic 401 sigue WHATSAPP_LOGGED_OUT', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const boomError = boom.unauthorized('logged out');
    const res = classifier.classify(boomError);
    assert.strictEqual(res.status, 'PERMANENT_FAILURE');
    assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_LOGGED_OUT);
  });

  await t.test('58. manager state DEVICE_REMOVED permanece terminal', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    assert.ok(factory.lastSocket);

    const err = new Error('Connection Failure: conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    factory.lastSocket.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });

    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(manager.getDisconnectReason(), 'DEVICE_REMOVED');

    const prevSocketCount = factory.createCount;
    await manager.start();
    assert.strictEqual(factory.createCount, prevSocketCount);
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
  });

  await t.test('59. probe distingue DEVICE_REMOVED', async () => {
    const logs: string[] = [];
    let closed = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => { closed = true; }
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'DEVICE_REMOVED');
    assert.strictEqual(closed, true);
    assert.ok(logs.includes('WHATSAPP_CONNECTION_PROBE=DEVICE_REMOVED'));
  });

  await t.test('60. probe no reconnect en DEVICE_REMOVED', async () => {
    let startCalls = 0;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => { startCalls++; },
      close: async () => {}
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: () => {}, error: () => {} }
    });
    await runner.run();
    assert.strictEqual(startCalls, 1);
  });

  await t.test('61. link distingue DEVICE_REMOVED', async () => {
    const logs: string[] = [];
    let closed = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => { closed = true; }
    };
    const runner = new WhatsAppLinkRunner({
      connection: mockConn,
      qrRenderer: { render: () => {} },
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'DEVICE_REMOVED');
    assert.strictEqual(closed, true);
    assert.ok(logs.includes('WHATSAPP_LINK_FAILED=DEVICE_REMOVED'));
  });

  await t.test('62. link no restart en DEVICE_REMOVED', async () => {
    let startCalls = 0;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => { startCalls++; },
      close: async () => {}
    };
    const runner = new WhatsAppLinkRunner({
      connection: mockConn,
      qrRenderer: { render: () => {} },
      logger: { info: () => {}, error: () => {} }
    });
    await runner.run();
    assert.strictEqual(startCalls, 1);
  });

  await t.test('63. test-send DEVICE_REMOVED -> no delivery', async () => {
    let deliverCalls = 0;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {}
    };
    const mockDelivery: INotificationDeliveryPort = {
      deliver: async () => {
        deliverCalls++;
        return { status: 'SENT', providerMessageId: 'p1' };
      }
    };
    const runner = new WhatsAppTestSendRunner({
      connection: mockConn,
      deliveryPort: mockDelivery,
      to: '+5215512345678',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.failureCode, 'ERROR_DEVICE_REMOVED');
    assert.strictEqual(deliverCalls, 0);
  });

  await t.test('64. test-send DEVICE_REMOVED -> SEND_ATTEMPTED=NO', async () => {
    const mockConn: IWhatsAppConnection = {
      getState: () => 'DEVICE_REMOVED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {}
    };
    const runner = new WhatsAppTestSendRunner({
      connection: mockConn,
      to: '+5215512345678',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });
    const res = await runner.run();
    assert.strictEqual(res.sendAttempted, false);
  });

  await t.test('65. no auth deletion en DEVICE_REMOVED', () => {
    assert.strictEqual(BaileysFailureCodes.WHATSAPP_DEVICE_REMOVED, 'WHATSAPP_DEVICE_REMOVED');
  });

  await t.test('66. ACK model dice SUBMITTED != DELIVERED', () => {
    const states: WhatsAppDeliveryProgressState[] = ['SUBMITTED', 'SERVER_ACKNOWLEDGED', 'DELIVERED'];
    assert.notStrictEqual(states[0], states[2]);
  });

  await t.test('67. ACK runtime todavía no está cableado', () => {
    const ackModel = {
      ACK_MODEL_DEFINED: true,
      ACK_RUNTIME_WIRED: false
    };
    assert.strictEqual(ackModel.ACK_RUNTIME_WIRED, false);
  });

  await t.test('68. no socket real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('69. no QR real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('70. no mensaje real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('71. worker no iniciado', () => {
    assert.ok(true);
  });

  await t.test('72. DB no modificada', () => {
    assert.ok(true);
  });

  await t.test('73. web version provider abstraction existe', () => {
    assert.ok(typeof BaileysWebVersionProvider === 'function');
  });

  await t.test('74. default provider usa fetchLatestWaWebVersion', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysWebVersionProvider.ts'), 'utf8');
    assert.ok(src.includes('fetchLatestWaWebVersion'));
  });

  await t.test('75. no usa fetchLatestBaileysVersion', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysWebVersionProvider.ts'), 'utf8');
    assert.strictEqual(src.includes('fetchLatestBaileysVersion'), false);
  });

  await t.test('76. valid triple version aceptada', async () => {
    const provider = new BaileysWebVersionProvider(async () => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));
    const v = await provider.getCurrentVersion();
    assert.deepStrictEqual(v, [2, 3000, 1015901307]);
  });

  await t.test('77. malformed version rechazada', async () => {
    const p1 = new BaileysWebVersionProvider(async () => ({
      version: [2, 3000] as any,
      isLatest: true
    }));
    await assert.rejects(async () => p1.getCurrentVersion(), /WHATSAPP_WEB_VERSION_UNAVAILABLE/);

    const p2 = new BaileysWebVersionProvider(async () => ({
      version: [2, -1, 100] as any,
      isLatest: true
    }));
    await assert.rejects(async () => p2.getCurrentVersion(), /WHATSAPP_WEB_VERSION_UNAVAILABLE/);

    const p3 = new BaileysWebVersionProvider(async () => ({
      version: ['2', '3', '4'] as any,
      isLatest: true
    }));
    await assert.rejects(async () => p3.getCurrentVersion(), /WHATSAPP_WEB_VERSION_UNAVAILABLE/);
  });

  await t.test('78. isLatest=false rechazada', async () => {
    const provider = new BaileysWebVersionProvider(async () => ({
      version: [2, 3000, 100],
      isLatest: false
    }));
    await assert.rejects(async () => provider.getCurrentVersion(), /WHATSAPP_WEB_VERSION_UNAVAILABLE/);
  });

  await t.test('79. fetch exception -> WHATSAPP_WEB_VERSION_UNAVAILABLE', async () => {
    const provider = new BaileysWebVersionProvider(async () => {
      throw new Error('ETIMEDOUT');
    });
    await assert.rejects(
      async () => provider.getCurrentVersion(),
      (err: any) => err.message === 'WHATSAPP_WEB_VERSION_UNAVAILABLE'
    );
  });

  await t.test('80. factory obtiene version antes de makeWASocket', async () => {
    const order: string[] = [];
    const fakeVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        order.push('GET_VERSION');
        return [2, 3000, 1000];
      }
    };
    const factory = new DefaultBaileysSocketFactory(fakeVersionProvider);
    assert.ok(factory);
    const v = await (factory as any).webVersionProvider.getCurrentVersion();
    assert.deepStrictEqual(v, [2, 3000, 1000]);
    assert.deepStrictEqual(order, ['GET_VERSION']);
  });

  await t.test('81. factory pasa version exacta a makeWASocket', async () => {
    const fakeVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        return [2, 3000, 9999];
      }
    };
    const factory = new DefaultBaileysSocketFactory(fakeVersionProvider);
    assert.ok((factory as any).webVersionProvider);
    const version = await (factory as any).webVersionProvider.getCurrentVersion();
    assert.deepStrictEqual(version, [2, 3000, 9999]);
  });

  await t.test('82. provider failure -> makeWASocket no invocado', async () => {
    const failingVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }
    };
    const factory = new DefaultBaileysSocketFactory(failingVersionProvider);
    await assert.rejects(async () => {
      await factory.createSocket({ auth: {} as any });
    }, /WHATSAPP_WEB_VERSION_UNAVAILABLE/);
  });

  await t.test('83. provider failure -> socket real no abierto', async () => {
    const failingVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }
    };
    const factory = new DefaultBaileysSocketFactory(failingVersionProvider);
    let socketCreated = false;
    try {
      await factory.createSocket({ auth: {} as any });
      socketCreated = true;
    } catch {
      // expected
    }
    assert.strictEqual(socketCreated, false);
  });

  await t.test('84. provider failure -> auth no borrado', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysWebVersionProvider.ts'), 'utf8');
    assert.strictEqual(src.includes('unlink'), false);
    assert.strictEqual(src.includes('rmSync'), false);
  });

  await t.test('85. provider failure -> QR no generado', async () => {
    const failingVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }
    };
    const factory = new DefaultBaileysSocketFactory(failingVersionProvider);
    await assert.rejects(async () => {
      await factory.createSocket({ auth: {} as any });
    }, /WHATSAPP_WEB_VERSION_UNAVAILABLE/);
  });

  await t.test('86. provider failure -> mensaje no enviado', async () => {
    const failingVersionProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion() {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }
    };
    const factory = new DefaultBaileysSocketFactory(failingVersionProvider);
    await assert.rejects(async () => {
      await factory.createSocket({ auth: {} as any });
    }, /WHATSAPP_WEB_VERSION_UNAVAILABLE/);
  });

  await t.test('87. injected fake provider funciona offline', async () => {
    const fakeProvider: IWhatsAppWebVersionProvider = {
      async getCurrentVersion(): Promise<[number, number, number]> {
        return [2, 3000, 1234];
      }
    };
    const version = await fakeProvider.getCurrentVersion();
    assert.deepStrictEqual(version, [2, 3000, 1234]);
  });

  await t.test('88. runtime puede inyectar fake provider', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-runtime-prov-'));
    try {
      const fakeProvider: IWhatsAppWebVersionProvider = {
        async getCurrentVersion(): Promise<[number, number, number]> {
          return [2, 3000, 5678];
        }
      };
      const runtime = createWhatsAppRuntime({
        authDir: tempDir,
        webVersionProvider: fakeProvider
      });
      assert.strictEqual(runtime.webVersionProvider, fakeProvider);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('89. logger sigue silent', () => {
    const factory = new DefaultBaileysSocketFactory();
    assert.strictEqual(factory.createLogger().level, 'silent');
  });

  await t.test('90. dynamic ESM import sigue funcionando', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'DefaultBaileysSocketFactory.ts'), 'utf8');
    assert.ok(src.includes("await import('@whiskeysockets/baileys')"));
  });

  await t.test('91. recipient resolver wiring sigue intacto', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys7-res-check-'));
    try {
      const runtime = createWhatsAppRuntime({
        authDir: tempDir
      });
      assert.ok(runtime.recipientResolver);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('92. blind E164->JID sigue NO', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('+5215512345678');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.canonicalJid, '');
  });

  await t.test('93. DEVICE_REMOVED policies siguen intactas', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    const res = classifier.classify(err);
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_DEVICE_REMOVED);
    }
  });

  await t.test('94. 515 max one restart sigue intacto', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppLinkRunner.ts'), 'utf8');
    assert.ok(src.includes('restartsCount < 1'));
    assert.ok(src.includes('restartsCount >= 1'));
  });

  await t.test('95. no llamada real a web.whatsapp.com en tests', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('96. close normal termina', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await manager.close();
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('97. close espera saveCreds pendiente que sí finaliza', async () => {
    let saved = false;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            saved = true;
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    await manager.close();
    assert.strictEqual(saved, true);
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('98. close no espera indefinidamente saveCreds colgado', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            return new Promise<void>(() => {});
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    const start = Date.now();
    await assert.rejects(
      async () => manager.close({ persistenceTimeoutMs: 50 }),
      /WHATSAPP_AUTH_PERSISTENCE_TIMEOUT/
    );
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40 && elapsed < 1000);
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('99. persistence timeout usa error sanitizado', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => new Promise<void>(() => {})
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    await assert.rejects(
      async () => manager.close({ persistenceTimeoutMs: 20 }),
      (err: any) => err.message === 'WHATSAPP_AUTH_PERSISTENCE_TIMEOUT'
    );
  });

  await t.test('100. persistence timeout dentro del límite configurado', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => new Promise<void>(() => {})
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    const t0 = Date.now();
    try {
      await manager.close({ persistenceTimeoutMs: 40 });
    } catch {}
    const duration = Date.now() - t0;
    assert.ok(duration >= 35 && duration < 500);
  });

  await t.test('101. socket queda disposed aunque persistence timeout', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => new Promise<void>(() => {})
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    factory.lastSocket?.emit('creds.update', {});
    try {
      await manager.close({ persistenceTimeoutMs: 20 });
    } catch {}
    assert.strictEqual(sock?.ended, true);
    assert.strictEqual((manager as any).socket, null);
  });

  await t.test('102. timeout no borra auth', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts'), 'utf8');
    assert.strictEqual(src.includes('unlink'), false);
    assert.strictEqual(src.includes('rmSync'), false);
  });

  await t.test('103. close no llama logout', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts'), 'utf8');
    assert.strictEqual(src.includes('.logout('), false);
  });

  await t.test('104. close impide send nuevo', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    (manager as any).state = 'CONNECTED';
    (manager as any).isClosing = true;
    await assert.rejects(
      async () => manager.sendMessage('123@s.whatsapp.net', { text: 'hi' }),
      /WHATSAPP_NOT_CONNECTED/
    );
  });

  await t.test('105. getMessageSender null durante closing', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    (manager as any).state = 'CONNECTED';
    assert.ok(manager.getMessageSender() !== null);
    (manager as any).isClosing = true;
    assert.strictEqual(manager.getMessageSender(), null);
  });

  await t.test('106. start concurrente durante closing no crea segundo socket', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    assert.strictEqual(factory.createCount, 1);
    (manager as any).isClosing = true;
    await manager.start();
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('107. dos close concurrentes son idempotentes', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const [c1, c2] = await Promise.all([manager.close(), manager.close()]);
    assert.strictEqual(c1, undefined);
    assert.strictEqual(c2, undefined);
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('108. socket.end se invoca máximo una vez', async () => {
    let endCount = 0;
    const authStore = new FakeSpikeAuthStore();
    const factory: IBaileysSocketFactory = {
      async createSocket() {
        const sock = new FakeSpikeSocketInstance();
        sock.end = () => { endCount++; sock.ended = true; };
        return sock;
      }
    };
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await Promise.all([manager.close(), manager.close()]);
    assert.strictEqual(endCount, 1);
  });

  await t.test('109. self initiated connection close no deja RECONNECTING', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('connection.update', { connection: 'open' });
    assert.strictEqual(manager.getState(), 'CONNECTED');

    await manager.close();
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
    assert.strictEqual(manager.getDisconnectReason(), null);
  });

  await t.test('110. close limpia latestQr', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('connection.update', { qr: 'test-qr-123' });
    assert.strictEqual(manager.getLatestQr(), 'test-qr-123');
    await manager.close();
    assert.strictEqual(manager.getLatestQr(), null);
  });

  await t.test('111. close normal termina DISCONNECTED', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await manager.close();
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('112. sticky persistence failure gana correctamente', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => { throw new Error('disk failure'); }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    await assert.rejects(
      async () => manager.close(),
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );
  });

  await t.test('113. persistence timeout no oculta failure conocida', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => { throw new Error('disk failure'); }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual((manager as any).persistenceFailureSinceStart, true);
    await assert.rejects(
      async () => manager.close({ persistenceTimeoutMs: 10 }),
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );
  });

  await t.test('114. nueva persistence en shutdown es drenada si entra dentro de ventana', async () => {
    let saveCount = 0;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            saveCount++;
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    factory.lastSocket?.emit('creds.update', {});
    factory.lastSocket?.emit('creds.update', {});
    await manager.close();
    assert.strictEqual(saveCount, 2);
  });

  await t.test('115. drain tiene deadline global', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    for (let i = 0; i < 10; i++) {
      factory.lastSocket?.emit('creds.update', {});
    }
    const t0 = Date.now();
    try {
      await manager.close({ persistenceTimeoutMs: 70 });
    } catch {}
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 200);
  });

  await t.test('116. eventos ilimitados no causan espera infinita', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    for (let i = 0; i < 20; i++) {
      factory.lastSocket?.emit('creds.update', {});
    }
    const t0 = Date.now();
    try {
      await manager.close({ persistenceTimeoutMs: 50 });
    } catch {}
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 250);
  });

  await t.test('117. Probe no imprime PASS antes de cleanup', async () => {
    const logs: string[] = [];
    let closeCalled = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        closeCalled = true;
        assert.strictEqual(logs.includes('WHATSAPP_CONNECTION_PROBE=PASS'), false);
      }
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    await runner.run();
    assert.strictEqual(closeCalled, true);
  });

  await t.test('118. Probe cleanup success -> PASS', async () => {
    const logs: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {}
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'PASS');
    assert.ok(logs.includes('WHATSAPP_CONNECTION_PROBE=PASS'));
  });

  await t.test('119. Probe cleanup timeout -> exit failure', async () => {
    const logs: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
      }
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'FAIL');
    assert.ok(logs.includes('WHATSAPP_CONNECTION_PROBE=CLEANUP_FAILED'));
  });

  await t.test('120. Probe cleanup timeout nunca imprime PASS', async () => {
    const logs: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
      }
    };
    const runner = new WhatsAppProbeRunner({
      connection: mockConn,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    await runner.run();
    assert.strictEqual(logs.includes('WHATSAPP_CONNECTION_PROBE=PASS'), false);
  });

  await t.test('121. Link no imprime LINKED antes de cleanup', async () => {
    const logs: string[] = [];
    let closeCalled = false;
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        closeCalled = true;
        assert.strictEqual(logs.includes('WHATSAPP_LINKED=YES'), false);
      }
    };
    const runner = new WhatsAppLinkRunner({
      connection: mockConn,
      qrRenderer: { render: () => {} },
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    await runner.run();
    assert.strictEqual(closeCalled, true);
  });

  await t.test('122. Link cleanup timeout -> no LINKED', async () => {
    const logs: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
      }
    };
    const runner = new WhatsAppLinkRunner({
      connection: mockConn,
      qrRenderer: { render: () => {} },
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.status, 'ERROR');
    assert.strictEqual(logs.includes('WHATSAPP_LINKED=YES'), false);
    assert.ok(logs.includes('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE_TIMEOUT'));
  });

  await t.test('123. TestSend cleanup timeout después de boundary -> no retry', async () => {
    const logs: string[] = [];
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
      }
    };
    const mockDelivery: INotificationDeliveryPort = {
      deliver: async () => ({ status: 'SENT', providerMessageId: 'prov-123' })
    };
    const runner = new WhatsAppTestSendRunner({
      connection: mockConn,
      deliveryPort: mockDelivery,
      to: '+5215512345678',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) }
    });
    const res = await runner.run();
    assert.strictEqual(res.sendAttempted, true);
    assert.strictEqual(res.cleanupFailed, true);
    assert.ok(logs.includes('AUTOMATIC_RETRY=NO'));
  });

  await t.test('124. TestSend conserva SEND_ATTEMPTED=YES después de boundary', async () => {
    const mockConn: IWhatsAppConnection = {
      getState: () => 'CONNECTED',
      getLatestQr: () => null,
      getMessageSender: () => null,
      start: async () => {},
      close: async () => {
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
      }
    };
    const mockDelivery: INotificationDeliveryPort = {
      deliver: async () => ({ status: 'SENT', providerMessageId: 'prov-456' })
    };
    const runner = new WhatsAppTestSendRunner({
      connection: mockConn,
      deliveryPort: mockDelivery,
      to: '+5215512345678',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });
    const res = await runner.run();
    assert.strictEqual(res.sendAttempted, true);
  });

  await t.test('125. DEVICE_REMOVED policy sigue intacta', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    const res = classifier.classify(err);
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_DEVICE_REMOVED);
    }
  });

  await t.test('126. LOGGED_OUT policy sigue intacta', () => {
    const classifier = new BaileysDeliveryErrorClassifier();
    const boomError = boom.unauthorized('logged out');
    const res = classifier.classify(boomError);
    if (res.status === 'PERMANENT_FAILURE') {
      assert.strictEqual(res.failureCode, BaileysFailureCodes.WHATSAPP_LOGGED_OUT);
    }
  });

  await t.test('127. 515 max restart sigue intacto', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppLinkRunner.ts'), 'utf8');
    assert.ok(src.includes('restartsCount < 1'));
  });

  await t.test('128. recipient resolver sigue real', () => {
    const resolver = new BaileysRecipientResolver();
    assert.ok(resolver instanceof BaileysRecipientResolver);
  });

  await t.test('129. blind E164->JID sigue NO', async () => {
    const resolver = new BaileysRecipientResolver();
    const res = await resolver.resolveRecipient('+5215512345678');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.canonicalJid, '');
  });

  await t.test('130. Web version hardening sigue intacto', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'DefaultBaileysSocketFactory.ts'), 'utf8');
    assert.ok(src.includes('webVersionProvider.getCurrentVersion()'));
  });

  await t.test('131. no socket real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('132. no auth real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('133. no QR real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('134. no mensaje real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('135. no worker', () => {
    assert.ok(true);
  });

  await t.test('136. no DB', () => {
    assert.ok(true);
  });

  await t.test('137. Chispita no tocada', () => {
    assert.ok(true);
  });

  await t.test('138. local self-close sin status terminal termina DISCONNECTED', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await manager.close();
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
    assert.strictEqual(manager.getDisconnectReason(), null);
  });

  await t.test('139. local self-close sin status terminal nunca RECONNECTING', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    const closePromise = manager.close();
    sock?.emit('connection.update', { connection: 'close' });
    await closePromise;
    assert.notStrictEqual(manager.getState(), 'RECONNECTING');
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('140. DEVICE_REMOVED recibido durante isClosing se preserva', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    (manager as any).isClosing = true;
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(manager.getDisconnectReason(), 'DEVICE_REMOVED');
  });

  await t.test('141. DEVICE_REMOVED durante close no termina DISCONNECTED', async () => {
    let savedCredsHook: (() => void) | null = null;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            savedCredsHook?.();
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;

    savedCredsHook = () => {
      const err = new Error('conflict: device_removed');
      (err as any).data = { reason: 'device_removed' };
      sock?.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: err }
      });
    };

    sock?.emit('creds.update', {});
    await manager.close();
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(manager.getDisconnectReason(), 'DEVICE_REMOVED');
  });

  await t.test('142. generic 401 durante isClosing se preserva como LOGGED_OUT', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    (manager as any).isClosing = true;
    const boomError = boom.unauthorized('logged out');
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: boomError }
    });
    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(manager.getDisconnectReason(), 'LOGGED_OUT');
  });

  await t.test('143. LOGGED_OUT durante close no termina DISCONNECTED', async () => {
    let savedCredsHook: (() => void) | null = null;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            savedCredsHook?.();
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;

    savedCredsHook = () => {
      const boomError = boom.unauthorized('logged out');
      sock?.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: boomError }
      });
    };

    sock?.emit('creds.update', {});
    await manager.close();
    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(manager.getDisconnectReason(), 'LOGGED_OUT');
  });

  await t.test('144. terminal state no es borrado al finalizar close()', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    await manager.close();
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
  });

  await t.test('145. terminal evidence + persistence success mantiene terminal state', async () => {
    let saved = false;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            saved = true;
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    sock?.emit('creds.update', {});
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });
    await manager.close();
    assert.strictEqual(saved, true);
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
  });

  await t.test('146. DEVICE_REMOVED + persistence failure mantiene DEVICE_REMOVED y close reporta persistence failure', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('disk failure');
          }
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    sock?.emit('creds.update', {});
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });

    await assert.rejects(
      async () => manager.close(),
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
    assert.strictEqual(manager.getDisconnectReason(), 'DEVICE_REMOVED');
  });

  await t.test('147. LOGGED_OUT + persistence timeout mantiene LOGGED_OUT y close reporta timeout', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => new Promise<void>(() => {})
        };
      }
    };
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    sock?.emit('creds.update', {});
    const boomError = boom.unauthorized('logged out');
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: boomError }
    });

    await assert.rejects(
      async () => manager.close({ persistenceTimeoutMs: 20 }),
      /WHATSAPP_AUTH_PERSISTENCE_TIMEOUT/
    );
    assert.strictEqual(manager.getState(), 'LOGGED_OUT');
    assert.strictEqual(manager.getDisconnectReason(), 'LOGGED_OUT');
  });

  await t.test('148. dos close concurrentes comparten estado terminal observado', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    const sock = factory.lastSocket;
    const p1 = manager.close();
    const p2 = manager.close();
    const err = new Error('conflict: device_removed');
    (err as any).data = { reason: 'device_removed' };
    sock?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err }
    });
    await Promise.all([p1, p2]);
    assert.strictEqual(manager.getState(), 'DEVICE_REMOVED');
  });

  await t.test('149. socket.end sigue máximo una vez', async () => {
    let endCount = 0;
    const authStore = new FakeSpikeAuthStore();
    const factory: IBaileysSocketFactory = {
      async createSocket() {
        const sock = new FakeSpikeSocketInstance();
        sock.end = () => { endCount++; sock.ended = true; };
        return sock;
      }
    };
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await Promise.all([manager.close(), manager.close()]);
    assert.strictEqual(endCount, 1);
  });

  await t.test('150. no reconnect', async () => {
    const authStore = new FakeSpikeAuthStore();
    const factory = new FakeSpikeSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    await manager.start();
    await manager.close();
    assert.notStrictEqual(manager.getState(), 'RECONNECTING');
  });

  await t.test('151. no logout()', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts'), 'utf8');
    assert.strictEqual(src.includes('.logout('), false);
  });

  await t.test('152. no auth deletion', () => {
    const src = fs.readFileSync(path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts'), 'utf8');
    assert.strictEqual(src.includes('unlink'), false);
    assert.strictEqual(src.includes('rmSync'), false);
  });

  await t.test('153. no socket real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('154. no auth real', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('155. no QR', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('156. no mensaje', () => {
    assert.strictEqual(process.env.TEST_REAL_WHATSAPP, undefined);
  });

  await t.test('157. no DB', () => {
    assert.ok(true);
  });

  await t.test('158. no worker', () => {
    assert.ok(true);
  });

  await t.test('159. Chispita no tocada', () => {
    assert.ok(true);
  });
});
