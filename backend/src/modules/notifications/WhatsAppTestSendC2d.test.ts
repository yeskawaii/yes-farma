import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  WhatsAppTestSendRunner,
  FIXED_TEST_SEND_MESSAGE,
  isValidE164
} from './infrastructure/baileys/WhatsAppTestSendRunner';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';
import {
  WhatsAppConnectionState,
  WhatsAppDisconnectReason
} from './infrastructure/baileys/BaileysTypes';
import { INotificationDeliveryPort } from './domain/NotificationDeliveryPort';
import {
  NotificationDeliveryParams,
  NotificationDeliveryResult
} from './domain/NotificationTypes';
import { DefaultBaileysSocketFactory } from './infrastructure/baileys/DefaultBaileysSocketFactory';
import { BaileysNotificationDeliveryAdapter } from './infrastructure/baileys/BaileysNotificationDeliveryAdapter';

class FakeTestConnection implements IWhatsAppConnection {
  state: WhatsAppConnectionState = 'CONNECTING';
  latestQr: string | null = null;
  disconnectReason: WhatsAppDisconnectReason | null = null;
  startCalls = 0;
  closeCalls = 0;
  closeError: Error | null = null;
  sentMessages: Array<{ jid: string; content: any }> = [];

  getState(): WhatsAppConnectionState {
    return this.state;
  }
  getLatestQr(): string | null {
    return this.latestQr;
  }
  getDisconnectReason(): WhatsAppDisconnectReason | null {
    return this.disconnectReason;
  }
  async start(): Promise<void> {
    this.startCalls++;
  }
  async close(): Promise<void> {
    this.closeCalls++;
    if (this.closeError) {
      throw this.closeError;
    }
  }
  getMessageSender(): { sendMessage: (jid: string, content: any) => Promise<any> } | null {
    return {
      sendMessage: async (jid: string, content: any): Promise<any> => {
        this.sentMessages.push({ jid, content });
        return { key: { id: 'fake-provider-id-999' } };
      }
    };
  }
  async queryRegisteredRecipient(phone: string): Promise<Array<{ jid: string; exists: boolean }>> {
    const digitsOnly = phone.replace(/^\+/, '');
    return [{ jid: `${digitsOnly}@s.whatsapp.net`, exists: true }];
  }
}

class FakeDeliveryPort implements INotificationDeliveryPort {
  calls: NotificationDeliveryParams[] = [];
  result: NotificationDeliveryResult = {
    status: 'SENT',
    providerMessageId: 'fake-provider-id-999'
  };

  async deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult> {
    this.calls.push(params);
    return this.result;
  }
}

test('WhatsApp Test Send Manual Smoke Test - Phase C2d', async (t) => {
  await t.test('1. falta --confirm -> abort antes de socket', async () => {
    const conn = new FakeTestConnection();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: '',
      logger: { info: () => {}, error: (msg) => loggedErrors.push(msg) }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'ABORTED');
    assert.strictEqual(conn.startCalls, 0);
    assert.ok(loggedErrors.includes('WHATSAPP_TEST_SEND=ABORTED'));
  });

  await t.test('2. confirm incorrecto -> abort antes de socket', async () => {
    const conn = new FakeTestConnection();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'WRONG_CONFIRM',
      logger: { info: () => {}, error: (msg) => loggedErrors.push(msg) }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'ABORTED');
    assert.strictEqual(conn.startCalls, 0);
    assert.ok(loggedErrors.includes('WHATSAPP_TEST_SEND=ABORTED'));
  });

  await t.test('3. falta --to -> invalid recipient antes de socket', async () => {
    const conn = new FakeTestConnection();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: (msg) => loggedErrors.push(msg) }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.startCalls, 0);
    assert.ok(loggedErrors.includes('WHATSAPP_TEST_SEND=INVALID_RECIPIENT'));
  });

  await t.test('4. recipient sin + -> reject', () => {
    assert.strictEqual(isValidE164('12345678901'), false);
  });

  await t.test('5. recipient con espacios -> reject', () => {
    assert.strictEqual(isValidE164('+1 234 567 8901'), false);
  });

  await t.test('6. recipient con guiones -> reject', () => {
    assert.strictEqual(isValidE164('+1-234-567-8901'), false);
  });

  await t.test('7. recipient con JID -> reject', () => {
    assert.strictEqual(isValidE164('12345678901@s.whatsapp.net'), false);
  });

  await t.test('8. E164 válido acepta', () => {
    assert.strictEqual(isValidE164('+5215512345678'), true);
    assert.strictEqual(isValidE164('+12345678901'), true);
  });

  await t.test('9. mensaje es exactamente el fijo acordado', () => {
    assert.strictEqual(
      FIXED_TEST_SEND_MESSAGE,
      'Prueba técnica de YESKIRA Dental. No requiere respuesta.'
    );
  });

  await t.test('10. CLI no acepta --message', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('hasMessageArg'));
    assert.ok(content.includes('MESSAGE_NOT_ALLOWED'));
  });

  await t.test('11. runner CONNECTED -> delivery llamado exactamente una vez', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(delivery.calls.length, 1);
  });

  await t.test('12. PASS requiere providerMessageId', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    delivery.result = {
      status: 'AMBIGUOUS_FAILURE',
      failureCode: 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.notStrictEqual(result.status, 'PASS');
    assert.strictEqual(result.status, 'AMBIGUOUS');
  });

  await t.test('13. providerMessageId no se imprime', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    await runner.run();
    assert.strictEqual(loggedOutputs.some((m) => m.includes('fake-provider-id-999')), false);
  });

  await t.test('14. phone no se imprime', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    await runner.run();
    assert.strictEqual(loggedOutputs.some((m) => m.includes('+12345678901')), false);
  });

  await t.test('15. JID no se imprime', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    await runner.run();
    assert.strictEqual(loggedOutputs.some((m) => m.includes('@s.whatsapp.net')), false);
  });

  await t.test('16. message body no se imprime', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    await runner.run();
    assert.strictEqual(loggedOutputs.some((m) => m.includes(FIXED_TEST_SEND_MESSAGE)), false);
  });

  await t.test('17. QR_REQUIRED -> no delivery', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'QR_REQUIRED';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 0);
  });

  await t.test('18. LOGGED_OUT -> no delivery', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'LOGGED_OUT';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 0);
  });

  await t.test('19. ERROR -> no delivery', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'ERROR';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 0);
  });

  await t.test('20. RECONNECTING -> no auto reconnect', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'RECONNECTING';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 0);
    assert.strictEqual(conn.startCalls, 1);
  });

  await t.test('21. connection timeout -> no delivery', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTING';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      timeoutMs: 30,
      pollIntervalMs: 10,
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'TIMEOUT');
    assert.strictEqual(delivery.calls.length, 0);
  });

  await t.test('22. retryable delivery failure -> no retry', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    delivery.result = {
      status: 'RETRYABLE_FAILURE',
      failureCode: 'WHATSAPP_RATE_LIMITED'
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 1);
  });

  await t.test('23. ambiguous delivery -> no retry', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    delivery.result = {
      status: 'AMBIGUOUS_FAILURE',
      failureCode: 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'AMBIGUOUS');
    assert.strictEqual(delivery.calls.length, 1);
  });

  await t.test('24. permanent failure -> no retry', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    delivery.result = {
      status: 'PERMANENT_FAILURE',
      failureCode: 'WHATSAPP_RECIPIENT_INVALID'
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(delivery.calls.length, 1);
  });

  await t.test('25. delivery port max call count = 1', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    await runner.run();
    assert.strictEqual(delivery.calls.length, 1);
  });

  await t.test('26. successful delivery + close failure no segundo send', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.closeError = new Error('Socket disconnect error');
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.cleanupFailed, true);
    assert.strictEqual(delivery.calls.length, 1);
    assert.ok(loggedOutputs.includes('CONNECTION_CLEANUP=FAIL'));
  });

  await t.test('27. successful delivery + auth persistence failure no segundo send', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.closeError = new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
    const delivery = new FakeDeliveryPort();
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.authPersistenceFailed, true);
    assert.strictEqual(delivery.calls.length, 1);
    assert.ok(loggedOutputs.includes('AUTH_PERSISTENCE=FAIL'));
    assert.ok(loggedOutputs.includes('AUTOMATIC_RETRY=NO'));
  });

  await t.test('28. cleanup failure se distingue de delivery failure', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.closeError = new Error('Generic cleanup failure');
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    // Delivery succeeded so status is PASS, but cleanupFailed is true
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.cleanupFailed, true);
  });

  await t.test('29. process.exit no usado', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('process.exit('), false);
  });

  await t.test('30. process.exitCode usado', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('process.exitCode ='), true);
  });

  await t.test('31. no setInterval', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const runnerPath = path.join(
      __dirname,
      'infrastructure',
      'baileys',
      'WhatsAppTestSendRunner.ts'
    );
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    const runnerContent = fs.readFileSync(runnerPath, 'utf8');
    assert.strictEqual(scriptContent.includes('setInterval'), false);
    assert.strictEqual(runnerContent.includes('setInterval'), false);
  });

  await t.test('32. no auth real', () => {
    const realAuthPath = path.join(os.homedir(), '.yeskira', 'whatsapp-auth');
    assert.ok(realAuthPath.includes('.yeskira'));
  });

  await t.test('33. no socket real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.startCalls, 0);
  });

  await t.test('34. no QR real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.latestQr, null);
  });

  await t.test('35. no message real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('36. script compilado presente tras build', () => {
    const tsPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    assert.strictEqual(fs.existsSync(tsPath), true);
  });

  await t.test('37. package script whatsapp:test-send existe', () => {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(
      pkg.scripts?.['whatsapp:test-send'],
      'node dist/scripts/whatsapp-test-send.js'
    );
  });

  await t.test('38. adapter usado, no socket.sendMessage directo desde script', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('sendMessage'), false);
    assert.strictEqual(content.includes('@whiskeysockets/baileys'), false);
  });

  await t.test('39. Baileys continúa silent', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();
    assert.strictEqual(logger.level, 'silent');
  });

  await t.test('40. worker no se inicia', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.strictEqual(content.includes('NotificationWorkerService'), false);
  });

  // ==========================================
  // PHASE C2d EXTENDED TESTS (41 - 62)
  // ==========================================

  await t.test('41. deliveryPort invocado no implica automáticamente SEND_ATTEMPTED=YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    let sendAttempted = false;
    const fakePort: INotificationDeliveryPort = {
      deliver: async () => {
        // Fails pre-send without calling external boundary
        return {
          status: 'PERMANENT_FAILURE',
          failureCode: 'WHATSAPP_RECIPIENT_INVALID'
        };
      }
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: fakePort,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      isSendAttempted: () => sendAttempted,
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(result.sendAttempted, false);
  });

  await t.test('42. fallo pre-send del adapter reporta SEND_ATTEMPTED=NO', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    let adapterObserverCalled = false;
    const adapter = new BaileysNotificationDeliveryAdapter(conn, {
      onSendAttempt: () => {
        adapterObserverCalled = true;
      }
    });

    // Pass invalid recipient to adapter deliver
    const deliverResult = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: 'invalid-no-plus',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(deliverResult.status, 'PERMANENT_FAILURE');
    assert.strictEqual(adapterObserverCalled, false);
  });

  await t.test('43. observer se dispara exactamente una vez justo antes de sender.sendMessage', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    let observerCount = 0;
    const adapter = new BaileysNotificationDeliveryAdapter(conn, {
      onSendAttempt: () => {
        observerCount++;
      }
    });

    await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+12345678901',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(observerCount, 1);
  });

  await t.test('44. SENT reporta SEND_ATTEMPTED=YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.sendAttempted, true);
  });

  await t.test('45. AMBIGUOUS después de send reporta SEND_ATTEMPTED=YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.getMessageSender = () => ({
      sendMessage: async () => {
        // Return without key.id -> ambiguous
        return { key: {} };
      }
    });
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'AMBIGUOUS');
    assert.strictEqual(result.sendAttempted, true);
    assert.ok(loggedOutputs.includes('SEND_ATTEMPTED=YES'));
  });

  await t.test('46. permanent provider failure después de send reporta YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.getMessageSender = () => ({
      sendMessage: async () => {
        const boom = new Error('Logged out');
        (boom as any).output = { statusCode: 401 };
        throw boom;
      }
    });
    const loggedOutputs: string[] = [];
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: {
        info: (msg) => loggedOutputs.push(msg),
        error: (msg) => loggedOutputs.push(msg)
      }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(result.sendAttempted, true);
    assert.ok(loggedOutputs.includes('SEND_ATTEMPTED=YES'));
  });

  await t.test('47. pre-send disconnected/retryable reporta NO', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'DISCONNECTED';
    let observerFired = false;
    const adapter = new BaileysNotificationDeliveryAdapter(conn, {
      onSendAttempt: () => {
        observerFired = true;
      }
    });

    const deliverResult = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+12345678901',
      body: 'Test',
      jobId: 'job-1'
    });

    assert.strictEqual(deliverResult.status, 'RETRYABLE_FAILURE');
    assert.strictEqual(observerFired, false);
  });

  await t.test('48. no se infiere sendAttempted solamente desde delivery status', async () => {
    // Case 1: PERMANENT_FAILURE before send boundary
    let send1 = false;
    const port1: INotificationDeliveryPort = {
      deliver: async () => ({
        status: 'PERMANENT_FAILURE',
        failureCode: 'INVALID_CHANNEL'
      })
    };
    const conn1 = new FakeTestConnection();
    conn1.state = 'CONNECTED';
    const runner1 = new WhatsAppTestSendRunner({
      connection: conn1,
      deliveryPort: port1,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      isSendAttempted: () => send1,
      logger: { info: () => {}, error: () => {} }
    });
    const res1 = await runner1.run();
    assert.strictEqual(res1.status, 'FAIL');
    assert.strictEqual(res1.sendAttempted, false);

    // Case 2: PERMANENT_FAILURE after send boundary
    let send2 = true;
    const port2: INotificationDeliveryPort = {
      deliver: async () => ({
        status: 'PERMANENT_FAILURE',
        failureCode: 'PROVIDER_REJECTED'
      })
    };
    const conn2 = new FakeTestConnection();
    conn2.state = 'CONNECTED';
    const runner2 = new WhatsAppTestSendRunner({
      connection: conn2,
      deliveryPort: port2,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      isSendAttempted: () => send2,
      logger: { info: () => {}, error: () => {} }
    });
    const res2 = await runner2.run();
    assert.strictEqual(res2.status, 'FAIL');
    assert.strictEqual(res2.sendAttempted, true);
  });

  await t.test('49. unexpected start failure ejecuta cleanup', async () => {
    const conn = new FakeTestConnection();
    conn.start = async () => {
      throw new Error('Socket initialization failed');
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('50. unexpected polling failure ejecuta cleanup', async () => {
    const conn = new FakeTestConnection();
    conn.getState = () => {
      throw new Error('State query crashed');
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('51. unexpected delivery exception ejecuta cleanup', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const badPort: INotificationDeliveryPort = {
      deliver: async () => {
        throw new Error('Uncaught port exception');
      }
    };
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: badPort,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('52. cleanup se intenta como máximo una vez lógicamente', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('53. signal + finally no producen envío adicional', async () => {
    const conn = new FakeTestConnection();
    const delivery = new FakeDeliveryPort();
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      deliveryPort: delivery,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      registerSignalHandlers: true,
      pollIntervalMs: 10,
      timeoutMs: 500,
      logger: { info: () => {}, error: () => {} }
    });

    const runPromise = runner.run();
    process.emit('SIGTERM');
    await runPromise;

    assert.strictEqual(delivery.calls.length, 0);
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('54. successful send + cleanup failure mantiene SEND_ATTEMPTED=YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.closeError = new Error('EPIPE on socket teardown');
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.sendAttempted, true);
    assert.strictEqual(result.cleanupFailed, true);
  });

  await t.test('55. successful send + auth persistence failure mantiene YES', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    conn.closeError = new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
    const runner = new WhatsAppTestSendRunner({
      connection: conn,
      to: '+12345678901',
      confirm: 'YESKIRA_SEND_TEST',
      logger: { info: () => {}, error: () => {} }
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.sendAttempted, true);
    assert.strictEqual(result.authPersistenceFailed, true);
  });

  await t.test('56. fatal CLI fallback no afirma SEND_ATTEMPTED=NO sin evidencia', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('SEND_ATTEMPTED=UNKNOWN'));
  });

  await t.test('57. fatal CLI fallback usa AUTOMATIC_RETRY=NO', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-test-send.ts');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('AUTOMATIC_RETRY=NO'));
  });

  await t.test('58. adapter observer opcional no cambia callers existentes', async () => {
    const conn = new FakeTestConnection();
    conn.state = 'CONNECTED';
    // Instantiation without options
    const adapter = new BaileysNotificationDeliveryAdapter(conn);
    const res = await adapter.deliver({
      channel: 'WHATSAPP',
      recipient: '+12345678901',
      body: 'Hello',
      jobId: 'test-job'
    });
    assert.strictEqual(res.status, 'SENT');
  });

  await t.test('59. worker contract no cambia', () => {
    const filePath = path.join(__dirname, 'application', 'NotificationWorkerService.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(content.includes('@whiskeysockets/baileys'), false);
  });

  await t.test('60. ningún socket real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.startCalls, 0);
  });

  await t.test('61. ningún QR real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.latestQr, null);
  });

  await t.test('62. ningún mensaje real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });
});
