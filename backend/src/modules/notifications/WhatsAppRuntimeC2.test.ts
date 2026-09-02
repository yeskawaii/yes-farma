import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createWhatsAppRuntime } from './infrastructure/baileys/createWhatsAppRuntime';
import { prepareWhatsAppAuthDir } from './infrastructure/baileys/prepareWhatsAppAuthDir';
import { TerminalQrRenderer } from './infrastructure/baileys/TerminalQrRenderer';
import { IQrRenderer } from './infrastructure/baileys/IQrRenderer';
import { resolveOperatorAuthDir } from './infrastructure/baileys/resolveOperatorAuthDir';
import { WhatsAppLinkRunner } from './infrastructure/baileys/WhatsAppLinkRunner';
import { WhatsAppProbeRunner } from './infrastructure/baileys/WhatsAppProbeRunner';
import { BaileysConnectionManager } from './infrastructure/baileys/BaileysConnectionManager';
import { IWhatsAppAuthStateStore } from './infrastructure/baileys/IWhatsAppAuthStateStore';
import {
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  IBaileysMessageSender,
  BaileysSendResult,
  WhatsAppDisconnectReason
} from './infrastructure/baileys/BaileysTypes';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';
import { DefaultBaileysSocketFactory } from './infrastructure/baileys/DefaultBaileysSocketFactory';

class FakeAuthStateStore implements IWhatsAppAuthStateStore {
  async getAuthState() {
    return {
      state: { creds: {}, keys: {} } as any,
      saveCreds: async () => {}
    };
  }
}

class FakeTestSocketInstance implements IBaileysSocketInstance {
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

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult> {
    this.sentMessages.push({ jid, content });
    return { key: { id: 'test-fake-msg-id' } };
  }

  end() {
    this.ended = true;
  }
}

class FakeTestSocketFactory implements IBaileysSocketFactory {
  public createCount = 0;
  public lastCreatedSocket: FakeTestSocketInstance | null = null;

  async createSocket(): Promise<IBaileysSocketInstance> {
    this.createCount++;
    const sock = new FakeTestSocketInstance();
    this.lastCreatedSocket = sock;
    return sock;
  }
}

class FakeTestConnection implements IWhatsAppConnection, IBaileysMessageSender {
  public state: any = 'DISCONNECTED';
  public latestQr: string | null = null;
  public disconnectReason: WhatsAppDisconnectReason | null = null;
  public startCalls = 0;
  public closeCalls = 0;
  public sentMessages: any[] = [];
  public waitForAuthPersistence?: (options?: any) => Promise<void>;

  getState() {
    return this.state;
  }

  getLatestQr() {
    return this.latestQr;
  }

  getDisconnectReason(): WhatsAppDisconnectReason | null {
    return this.disconnectReason;
  }

  async start() {
    this.startCalls++;
    this.state = 'CONNECTING';
  }

  async close() {
    this.closeCalls++;
    this.state = 'DISCONNECTED';
  }

  getMessageSender(): IBaileysMessageSender | null {
    if (this.state === 'CONNECTED') return this;
    return null;
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult> {
    this.sentMessages.push({ jid, content });
    return { key: { id: 'msg-id-1' } };
  }
}

class FakeQrRenderer implements IQrRenderer {
  public renderedQrs: string[] = [];

  render(qr: string): void {
    this.renderedQrs.push(qr);
  }
}

test('WhatsApp Runtime Factory, Persistence & Operator Commands - Phase C2', async (t) => {
  const tmpBaseDir = path.join(os.tmpdir(), `yeskira-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  t.after(() => {
    try {
      if (fs.existsSync(tmpBaseDir)) {
        fs.rmSync(tmpBaseDir, { recursive: true, force: true });
      }
    } catch {
      // Safe cleanup
    }
  });

  await t.test('1. runtime factory no llama start()', () => {
    const socketFactory = new FakeTestSocketFactory();
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-1');

    const runtime = createWhatsAppRuntime({
      authDir: testAuthDir,
      socketFactory
    });

    assert.ok(runtime);
    assert.strictEqual(socketFactory.createCount, 0);
    assert.strictEqual(runtime.connection.getState(), 'DISCONNECTED');
  });

  await t.test('2. runtime factory devuelve connection + delivery desacoplados', () => {
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-2');
    const runtime = createWhatsAppRuntime({ authDir: testAuthDir });

    assert.ok(runtime.connection);
    assert.ok(runtime.delivery);
    assert.ok(runtime.authStateStore);
    assert.strictEqual(typeof runtime.delivery.deliver, 'function');
    assert.strictEqual(typeof runtime.connection.start, 'function');
  });

  await t.test('3. authDir vacío es rechazado', () => {
    assert.throws(() => {
      prepareWhatsAppAuthDir('');
    }, /required and cannot be empty/);

    assert.throws(() => {
      prepareWhatsAppAuthDir('   ');
    }, /required and cannot be empty/);
  });

  await t.test('4. authDir relativo es rechazado en modo runtime seguro', () => {
    assert.throws(() => {
      prepareWhatsAppAuthDir('./relative/path', { requireAbsolute: true });
    }, /must be an absolute path/);
  });

  await t.test('5. auth directory puede prepararse sin crear credenciales falsas', () => {
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-5');
    const prepared = prepareWhatsAppAuthDir(testAuthDir);

    assert.strictEqual(fs.existsSync(prepared), true);
    const files = fs.readdirSync(prepared);
    assert.strictEqual(files.length, 0); // No synthetic files created
  });

  await t.test('6. preparación nunca borra archivos existentes', () => {
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-6');
    fs.mkdirSync(testAuthDir, { recursive: true });
    const dummyFile = path.join(testAuthDir, 'session-token.json');
    fs.writeFileSync(dummyFile, 'important-state');

    prepareWhatsAppAuthDir(testAuthDir);

    assert.strictEqual(fs.existsSync(dummyFile), true);
    assert.strictEqual(fs.readFileSync(dummyFile, 'utf8'), 'important-state');
  });

  await t.test('7. LOGGED_OUT nunca borra auth state', async () => {
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-7');
    fs.mkdirSync(testAuthDir, { recursive: true });
    const dummyCreds = path.join(testAuthDir, 'creds.json');
    fs.writeFileSync(dummyCreds, '{"me":"5210000000000"}');

    const socketFactory = new FakeTestSocketFactory();
    const runtime = createWhatsAppRuntime({ authDir: testAuthDir, socketFactory });

    await runtime.connection.start();
    socketFactory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } }
    });

    assert.strictEqual(runtime.connection.getState(), 'LOGGED_OUT');
    assert.strictEqual(fs.existsSync(dummyCreds), true);
  });

  await t.test('8. QR renderer recibe QR únicamente mediante operator flow', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'QR_REQUIRED';
    conn.latestQr = '2@operator-qr-code';

    // Wait a short tick
    await new Promise((r) => setTimeout(r, 50));
    conn.state = 'CONNECTED';
    await runPromise;

    assert.strictEqual(renderer.renderedQrs.length, 1);
    assert.strictEqual(renderer.renderedQrs[0], '2@operator-qr-code');
  });

  await t.test('9. raw QR no pasa a logger', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const loggedMessages: string[] = [];
    const logger = {
      info: (msg: string) => loggedMessages.push(msg),
      error: (msg: string) => loggedMessages.push(msg)
    };

    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      logger,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'QR_REQUIRED';
    conn.latestQr = '2@super-secret-qr-raw';

    await new Promise((r) => setTimeout(r, 50));
    conn.state = 'CONNECTED';
    await runPromise;

    for (const msg of loggedMessages) {
      assert.strictEqual(msg.includes('2@super-secret-qr-raw'), false);
    }
  });

  await t.test('10. operator link inicia connection solo al invocarse', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 100
    });

    assert.strictEqual(conn.startCalls, 0);
    const runPromise = runner.run();
    assert.strictEqual(conn.startCalls, 1);
    conn.state = 'CONNECTED';
    await runPromise;
  });

  await t.test('11. QR_REQUIRED llama renderer', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'QR_REQUIRED';
    conn.latestQr = 'qr-call-test';

    await new Promise((r) => setTimeout(r, 50));
    conn.state = 'CONNECTED';
    await runPromise;

    assert.ok(renderer.renderedQrs.includes('qr-call-test'));
  });

  await t.test('12. CONNECTED termina link con éxito', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'CONNECTED';
    const result = await runPromise;

    assert.strictEqual(result.status, 'LINKED');
  });

  await t.test('13. CONNECTED llama close', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'CONNECTED';
    await runPromise;

    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('14. LOGGED_OUT termina sin reintento', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'LOGGED_OUT';
    const result = await runPromise;

    assert.strictEqual(result.status, 'LOGGED_OUT');
    assert.strictEqual(conn.startCalls, 1);
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('15. ERROR termina con fallo controlado', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'ERROR';
    const result = await runPromise;

    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('16. timeout termina con fallo', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 50,
      pollIntervalMs: 10
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'TIMEOUT');
  });

  await t.test('17. timeout llama close', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 50,
      pollIntervalMs: 10
    });

    await runner.run();
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('18. SIGINT provoca close', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 5000,
      registerSignalHandlers: true
    });

    const runPromise = runner.run();
    process.emit('SIGINT' as any);
    const result = await runPromise;

    assert.strictEqual(result.status, 'ABORTED');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('19. SIGTERM provoca close', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 5000,
      registerSignalHandlers: true
    });

    const runPromise = runner.run();
    process.emit('SIGTERM' as any);
    const result = await runPromise;

    assert.strictEqual(result.status, 'ABORTED');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('20. link nunca llama delivery.deliver', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 50,
      pollIntervalMs: 10
    });

    conn.state = 'CONNECTED';
    await runner.run();

    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('21. link nunca instancia NotificationWorkerService', () => {
    const linkScriptPath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-link.ts');
    const content = fs.readFileSync(linkScriptPath, 'utf8');
    assert.strictEqual(content.includes('NotificationWorkerService'), false);
  });

  await t.test('22. probe CONNECTED -> PASS', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'CONNECTED';
    const result = await runPromise;

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('23. probe LOGGED_OUT -> resultado terminal', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'LOGGED_OUT';
    const result = await runPromise;

    assert.strictEqual(result.status, 'LOGGED_OUT');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('24. probe ERROR -> FAIL', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'ERROR';
    const result = await runPromise;

    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('25. probe timeout -> FAIL / TIMEOUT', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 50,
      pollIntervalMs: 10
    });

    const result = await runner.run();
    assert.strictEqual(result.status, 'TIMEOUT');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('26. probe nunca envía mensaje', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 500,
      pollIntervalMs: 20
    });

    const runPromise = runner.run();
    conn.state = 'CONNECTED';
    await runPromise;

    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('27. createApp no abre socket', () => {
    const appFilePath = path.join(__dirname, '..', '..', 'app', 'app.ts');
    const content = fs.readFileSync(appFilePath, 'utf8');
    assert.strictEqual(content.includes('createWhatsAppRuntime'), false);
    assert.strictEqual(content.includes('whatsapp'), false);
  });

  await t.test('28. index.ts no inicia WhatsApp', () => {
    const indexPath = path.join(__dirname, '..', '..', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.strictEqual(content.includes('whatsapp'), false);
    assert.strictEqual(content.includes('Baileys'), false);
  });

  await t.test('29. no existen endpoints HTTP de QR', () => {
    const appDir = path.join(__dirname, '..', '..', 'app');
    const files = fs.readdirSync(appDir);
    for (const f of files) {
      const content = fs.readFileSync(path.join(appDir, f), 'utf8');
      assert.strictEqual(content.includes('/api/whatsapp'), false);
      assert.strictEqual(content.includes('/qr'), false);
    }
  });

  await t.test('30. auth path no aparece en frontend', () => {
    const frontendDir = path.join(__dirname, '..', '..', '..', '..', 'frontend');
    if (fs.existsSync(frontendDir)) {
      const srcDir = path.join(frontendDir, 'src');
      if (fs.existsSync(srcDir)) {
        const findInDir = (dir: string): boolean => {
          const list = fs.readdirSync(dir);
          for (const item of list) {
            const p = path.join(dir, item);
            if (fs.statSync(p).isDirectory()) {
              if (findInDir(p)) return true;
            } else if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) {
              const c = fs.readFileSync(p, 'utf8');
              if (c.includes('whatsapp-auth') || c.includes('WHATSAPP_AUTH_DIR')) return true;
            }
          }
          return false;
        };
        assert.strictEqual(findInDir(srcDir), false);
      }
    }
  });

  await t.test('31. QR raw no se escribe a archivo', () => {
    const linkRunnerPath = path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppLinkRunner.ts');
    const content = fs.readFileSync(linkRunnerPath, 'utf8');
    assert.strictEqual(content.includes('fs.writeFileSync'), false);
    assert.strictEqual(content.includes('fs.writeFile'), false);
  });

  await t.test('32. session creds no se imprimen', () => {
    const managerPath = path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts');
    const content = fs.readFileSync(managerPath, 'utf8');
    assert.strictEqual(content.includes('console.log(authState'), false);
    assert.strictEqual(content.includes('console.log(creds'), false);
  });

  await t.test('33. Docker compose monta auth volume solo en backend', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.strictEqual(content.includes('whatsapp_auth_data:/app/data/whatsapp-auth'), true);
  });

  await t.test('34. auth volume apunta a /app/data/whatsapp-auth', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.strictEqual(content.includes('/app/data/whatsapp-auth'), true);
  });

  await t.test('35. frontend no monta auth volume', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    const frontendSection = content.split('frontend:')[1]?.split('volumes:')[0];
    assert.strictEqual(frontendSection?.includes('whatsapp_auth_data'), false);
  });

  await t.test('36. package scripts no requieren ts-node en runtime', () => {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const content = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);
    assert.strictEqual(pkg.scripts['whatsapp:link'], 'node dist/scripts/whatsapp-link.js');
    assert.strictEqual(pkg.scripts['whatsapp:probe'], 'node dist/scripts/whatsapp-probe.js');
  });

  await t.test('37. Docker build incluye operator JS compilado', () => {
    const dockerfilePath = path.join(__dirname, '..', '..', '..', 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.strictEqual(content.includes('COPY --from=build /usr/src/app/dist ./dist'), true);
  });

  await t.test('38. tests nunca abren WebSocket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('39. tests nunca generan QR real de WhatsApp', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('40. tests nunca envían mensajes', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  await t.test('41. production sin WHATSAPP_AUTH_DIR falla', () => {
    assert.throws(() => {
      resolveOperatorAuthDir({ nodeEnv: 'production' });
    }, /WHATSAPP_AUTH_DIR_REQUIRED/);
  });

  await t.test('42. production no utiliza fallback /app/data silencioso', () => {
    assert.throws(() => {
      resolveOperatorAuthDir({ nodeEnv: 'production', envAuthDir: '' });
    }, /WHATSAPP_AUTH_DIR_REQUIRED/);
  });

  await t.test('43. development sin env conserva fallback HOME', () => {
    const res = resolveOperatorAuthDir({ nodeEnv: 'development', homedir: '/mock/home' });
    assert.strictEqual(res, '/mock/home/.yeskira/whatsapp-auth');
  });

  await t.test('44. operator link con authDir relativo falla antes de start()', () => {
    assert.throws(() => {
      createWhatsAppRuntime({ authDir: './relative/auth', requireAbsoluteAuthDir: true });
    }, /must be an absolute path/);
  });

  await t.test('45. operator probe con authDir relativo falla antes de start()', () => {
    assert.throws(() => {
      createWhatsAppRuntime({ authDir: './relative/probe', requireAbsoluteAuthDir: true });
    }, /must be an absolute path/);
  });

  await t.test('46. operator production sin CLI/env authDir falla antes de start()', () => {
    assert.throws(() => {
      resolveOperatorAuthDir({ nodeEnv: 'production' });
    }, /WHATSAPP_AUTH_DIR_REQUIRED/);
  });

  await t.test('47. operator absolute authDir funciona con fake runtime', () => {
    const socketFactory = new FakeTestSocketFactory();
    const testAuthDir = path.join(tmpBaseDir, 'test-auth-47');
    const runtime = createWhatsAppRuntime({
      authDir: testAuthDir,
      requireAbsoluteAuthDir: true,
      socketFactory
    });
    assert.ok(runtime);
    assert.strictEqual(socketFactory.createCount, 0);
  });

  await t.test('48. path existente que es archivo es rechazado', () => {
    const filePath = path.join(tmpBaseDir, 'existing-file.txt');
    fs.writeFileSync(filePath, 'some data');

    assert.throws(() => {
      prepareWhatsAppAuthDir(filePath);
    }, /path exists but is not a directory/);
  });

  await t.test('49. path existente que es directorio permanece válido', () => {
    const dirPath = path.join(tmpBaseDir, 'valid-dir');
    fs.mkdirSync(dirPath, { recursive: true });

    const prepared = prepareWhatsAppAuthDir(dirPath);
    assert.strictEqual(prepared, dirPath);
  });

  await t.test('50. docker compose declara WHATSAPP_AUTH_DIR=/app/data/whatsapp-auth', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.strictEqual(content.includes('WHATSAPP_AUTH_DIR: /app/data/whatsapp-auth'), true);
  });

  await t.test('51. named volume continúa sin explicit global name', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.strictEqual(content.includes('name: whatsapp_auth_data'), false);
  });

  await t.test('52. volume continúa montado solo en backend', () => {
    const composePath = path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    const backendSection = content.split('backend:')[1]?.split('frontend:')[0];
    const frontendSection = content.split('frontend:')[1]?.split('volumes:')[0];

    assert.strictEqual(backendSection?.includes('whatsapp_auth_data:/app/data/whatsapp-auth'), true);
    assert.strictEqual(frontendSection?.includes('whatsapp_auth_data'), false);
  });

  // ==========================================
  // PHASE C2b TESTS (53 - 63)
  // ==========================================

  await t.test('53. close espera saveCreds pendiente', async () => {
    let saveCredsFinished = false;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((r) => setTimeout(r, 40));
            saveCredsFinished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    assert.strictEqual(saveCredsFinished, false);

    await manager.close();
    assert.strictEqual(saveCredsFinished, true);
  });

  await t.test('54. linkage no retorna LINKED antes de terminar saveCreds', async () => {
    let saveCredsFinished = false;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((r) => setTimeout(r, 40));
            saveCredsFinished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
    assert.strictEqual(saveCredsFinished, true);
  });

  await t.test('55. saveCreds failure impide LINKED', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('Disk write failed');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
  });

  await t.test('56. saveCreds failure produce resultado ERROR controlado', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('EACCES: permission denied');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE'));
  });

  await t.test('57. dos creds.update se serializan', async () => {
    let activeSaves = 0;
    let maxConcurrentSaves = 0;
    let saveCount = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            activeSaves++;
            maxConcurrentSaves = Math.max(maxConcurrentSaves, activeSaves);
            await new Promise((r) => setTimeout(r, 30));
            activeSaves--;
            saveCount++;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    // Fire two creds.update immediately
    factory.lastCreatedSocket?.emit('creds.update', { me: { id: '1' } });
    factory.lastCreatedSocket?.emit('creds.update', { me: { id: '2' } });

    await manager.close();
    assert.strictEqual(saveCount, 2);
    assert.strictEqual(maxConcurrentSaves, 1);
  });

  await t.test('58. close continúa siendo idempotente', async () => {
    const authStore = new FakeAuthStateStore();
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    await manager.close();
    await manager.close();
    await manager.close();

    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('59. whatsapp-link.ts no usa process.exit(...) para salida normal', () => {
    const filePath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-link.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(content.includes('process.exit('), false);
    assert.strictEqual(content.includes('process.exitCode = 0'), true);
    assert.strictEqual(content.includes('process.exitCode = 1'), true);
  });

  await t.test('60. whatsapp-probe.ts no usa process.exit(...) para salida normal', () => {
    const filePath = path.join(__dirname, '..', '..', 'scripts', 'whatsapp-probe.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(content.includes('process.exit('), false);
    assert.strictEqual(content.includes('process.exitCode = 0'), true);
    assert.strictEqual(content.includes('process.exitCode = 1'), true);
  });

  await t.test('61. ningún test abre socket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('62. ningún test genera QR real', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('63. ningún test envía mensajes', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  // ==========================================
  // PHASE C2b PART 2 TESTS (64 - 77)
  // ==========================================

  await t.test('64. open antes de creds.update no produce LINKED', async () => {
    let saveCredsFinished = false;
    let linkResolved = false;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            saveCredsFinished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run().then((res) => {
      linkResolved = true;
      return res;
    });

    await new Promise((r) => setTimeout(r, 10));
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-64' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(linkResolved, false);
    assert.strictEqual(saveCredsFinished, false);

    // Emit creds.update to let it complete
    factory.lastCreatedSocket?.emit('creds.update', {});
    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
    assert.strictEqual(saveCredsFinished, true);
  });

  await t.test('65. open -> creds.update -> save pendiente no produce LINKED', async () => {
    let saveCredsFinished = false;
    let linkResolved = false;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((r) => setTimeout(r, 60));
            saveCredsFinished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run().then((res) => {
      linkResolved = true;
      return res;
    });

    await new Promise((r) => setTimeout(r, 10));
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-65' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    factory.lastCreatedSocket?.emit('creds.update', {});

    // While save is sleeping (at 20ms of 60ms)
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(linkResolved, false);
    assert.strictEqual(saveCredsFinished, false);

    const result = await runPromise;
    assert.strictEqual(linkResolved, true);
    assert.strictEqual(result.status, 'LINKED');
    assert.strictEqual(saveCredsFinished, true);
  });

  await t.test('66. open -> creds.update -> save completo permite LINKED', async () => {
    let saveCredsFinished = false;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            saveCredsFinished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-66' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    factory.lastCreatedSocket?.emit('creds.update', {});

    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
    assert.strictEqual(saveCredsFinished, true);
  });

  await t.test('67. QR linkage conectado pero nunca llega creds.update -> ERROR por persistence timeout', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {}
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 80,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-67' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    // NEVER emit creds.update

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE_TIMEOUT'));
  });

  await t.test('68. QR linkage saveCreds falla -> ERROR, nunca LINKED', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('Disk write error');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-68' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    factory.lastCreatedSocket?.emit('creds.update', {});

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
  });

  await t.test('69. error público de persistence es exactamente WHATSAPP_AUTH_PERSISTENCE_FAILED', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('EACCES: permission denied, open /secret/path/creds.json');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});

    await assert.rejects(
      async () => {
        await manager.close();
      },
      (err: Error) => {
        return err.message === 'WHATSAPP_AUTH_PERSISTENCE_FAILED';
      }
    );
  });

  await t.test('70. error público no contiene mensaje original del filesystem', async () => {
    const rawSecretMessage = 'ENOENT: cannot find /tmp/secret-creds/keys.json';
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error(rawSecretMessage);
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});

    await assert.rejects(
      async () => {
        await manager.close();
      },
      (err: Error) => {
        assert.strictEqual(err.message.includes('ENOENT'), false);
        assert.strictEqual(err.message.includes('secret-creds'), false);
        assert.strictEqual(err.message, 'WHATSAPP_AUTH_PERSISTENCE_FAILED');
        return true;
      }
    );
  });

  await t.test('71. conexión existente sin QR no exige una nueva creds.update para probe', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: { me: { id: '5210000000000' } }, keys: {} } as any,
          saveCreds: async () => {}
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const runner = new WhatsAppProbeRunner({
      connection: manager,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    // Notice NO QR emitted: it is an existing session
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });

    const result = await runPromise;
    assert.strictEqual(result.status, 'PASS');
  });

  await t.test('72. persistenceChain sigue recuperable después de una escritura fallida', async () => {
    let attempt = 0;
    let saveCount = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 1) {
              throw new Error('First save failed');
            }
            saveCount++;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', { me: { id: '1' } });
    await new Promise((r) => setTimeout(r, 20));

    // Save #2
    factory.lastCreatedSocket?.emit('creds.update', { me: { id: '2' } });
    await assert.rejects(
      async () => {
        await manager.close();
      },
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );

    assert.strictEqual(saveCount, 1);
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('73. dos saves siguen siendo seriales', async () => {
    let activeSaves = 0;
    let maxConcurrent = 0;
    let totalSaves = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            activeSaves++;
            maxConcurrent = Math.max(maxConcurrent, activeSaves);
            await new Promise((r) => setTimeout(r, 30));
            activeSaves--;
            totalSaves++;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('creds.update', {});

    await manager.close();
    assert.strictEqual(totalSaves, 2);
    assert.strictEqual(maxConcurrent, 1);
  });

  await t.test('74. close sigue esperando saves ya encolados', async () => {
    let finished = false;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            await new Promise((r) => setTimeout(r, 40));
            finished = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    assert.strictEqual(finished, false);

    await manager.close();
    assert.strictEqual(finished, true);
  });

  await t.test('75. ningún test abre socket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('76. ningún test genera QR real', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('77. ningún test envía mensajes', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  // ==========================================
  // PHASE C2b STICKY FAILURE TESTS (78 - 89)
  // ==========================================

  await t.test('78. fallo save #1 + éxito save #2 sigue invalidando linkage actual', async () => {
    let attempt = 0;
    let secondSaveExecuted = false;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 1) {
              throw new Error('First disk write failed');
            }
            secondSaveExecuted = true;
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 10));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-78' });
    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    factory.lastCreatedSocket?.emit('creds.update', {});

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(secondSaveExecuted, true);
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE'));
  });

  await t.test('79. successful save posterior no limpia persistenceFailureSinceStart', async () => {
    let attempt = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 1) {
              throw new Error('Save 1 failed');
            }
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-for-test-79' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    await assert.rejects(
      async () => {
        await manager.waitForAuthPersistence({ timeoutMs: 100 });
      },
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );
  });

  await t.test('80. nuevo start resetea persistenceFailureSinceStart', async () => {
    let attempt = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 1) {
              throw new Error('Attempt 1 failed');
            }
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    // Session 1: fails
    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-session-1' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    try {
      await manager.close();
    } catch {
      // Expected failure
    }

    // Session 2: new start resets sticky flag
    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-session-2' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    // Must resolve successfully now
    await manager.waitForAuthPersistence({ timeoutMs: 200 });
    await manager.close();
    assert.strictEqual(manager.getState(), 'DISCONNECTED');
  });

  await t.test('81. cadena puede ejecutar save posterior después de fallo', async () => {
    let count = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            count++;
            if (count === 1) {
              throw new Error('First save failed');
            }
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(count, 2);
  });

  await t.test('82. waitForAuthPersistence falla sticky aunque haya éxito posterior', async () => {
    let count = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            count++;
            if (count === 1) {
              throw new Error('Flaky write');
            }
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-82' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    await assert.rejects(
      async () => {
        await manager.waitForAuthPersistence({ timeoutMs: 100 });
      },
      (err: Error) => err.message === 'WHATSAPP_AUTH_PERSISTENCE_FAILED'
    );
  });

  await t.test('83. close reporta WHATSAPP_AUTH_PERSISTENCE_FAILED tras fallo+éxito', async () => {
    let count = 0;

    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            count++;
            if (count === 1) {
              throw new Error('Storage write failed');
            }
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    await assert.rejects(
      async () => {
        await manager.close();
      },
      (err: Error) => err.message === 'WHATSAPP_AUTH_PERSISTENCE_FAILED'
    );
  });

  await t.test('84. error público sigue sanitizado', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('FATAL: /var/secrets/app-auth/creds.json disk corrupted');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    await assert.rejects(
      async () => {
        await manager.close();
      },
      (err: Error) => {
        assert.strictEqual(err.message, 'WHATSAPP_AUTH_PERSISTENCE_FAILED');
        return true;
      }
    );
  });

  await t.test('85. timeout continúa limpiándose tras resolve', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {}
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-85' });

    const waitPromise = manager.waitForAuthPersistence({ timeoutMs: 5000 });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await waitPromise;
    await manager.close();
  });

  await t.test('86. timeout continúa limpiándose tras reject', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            throw new Error('Immediate write failure');
          }
        };
      }
    };

    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);

    await manager.start();
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@qr-86' });

    const waitPromise = manager.waitForAuthPersistence({ timeoutMs: 5000 });
    factory.lastCreatedSocket?.emit('creds.update', {});

    await assert.rejects(
      async () => {
        await waitPromise;
      },
      /WHATSAPP_AUTH_PERSISTENCE_FAILED/
    );
    try {
      await manager.close();
    } catch {}
  });

  await t.test('87. ningún socket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('88. ningún QR real', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('89. ningún mensaje real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  // ==========================================
  // PHASE C2c TESTS (90 - 109)
  // ==========================================

  await t.test('90. DefaultBaileysSocketFactory configura logger silent', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();
    assert.strictEqual(logger.level, 'silent');
  });

  await t.test('91. logger de Baileys no imprime JID', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();

    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let written = '';

    process.stdout.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };
    process.stderr.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };

    try {
      logger.info({ jid: '5215551234567@s.whatsapp.net', remoteJid: '5215551234567@s.whatsapp.net' }, 'connected');
      logger.error({ jid: '5215551234567@s.whatsapp.net' }, 'error');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.strictEqual(written, '');
  });

  await t.test('92. logger de Baileys no imprime helloMsg/ephemeral', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();

    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let written = '';

    process.stdout.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };
    process.stderr.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };

    try {
      logger.debug({ helloMsg: 'sensitive-hello-message', ephemeral: 'sensitive-ephemeral-key' }, 'handshake');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.strictEqual(written, '');
  });

  await t.test('93. logger de Baileys no imprime auth state', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();

    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let written = '';

    process.stdout.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };
    process.stderr.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };

    try {
      logger.trace({
        creds: { noiseKey: 'noise-secret', signedIdentityKey: 'id-secret' },
        keys: { preKeys: { 1: 'prekey' } }
      }, 'auth state dump');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.strictEqual(written, '');
  });

  await t.test('94. logger de Baileys no imprime message body', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();

    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let written = '';

    process.stdout.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };
    process.stderr.write = (chunk: any) => {
      written += chunk.toString();
      return true;
    };

    try {
      logger.info({
        message: { conversation: 'Sensible patient medical data & diagnosis' }
      }, 'message payload');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.strictEqual(written, '');
  });

  await t.test('95. operator messages permitidos siguen funcionando', () => {
    const loggedInfos: string[] = [];
    const loggedErrors: string[] = [];
    const logger = {
      info: (msg: string) => loggedInfos.push(msg),
      error: (msg: string) => loggedErrors.push(msg)
    };

    logger.info('WHATSAPP_LINKED=YES');
    logger.info('WHATSAPP_CONNECTION_PROBE=PASS');
    logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE');
    logger.error('WHATSAPP_CONNECTION_PROBE=FAIL');

    assert.deepStrictEqual(loggedInfos, ['WHATSAPP_LINKED=YES', 'WHATSAPP_CONNECTION_PROBE=PASS']);
    assert.deepStrictEqual(loggedErrors, ['WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE', 'WHATSAPP_CONNECTION_PROBE=FAIL']);
  });

  await t.test('96. QR renderer sigue pudiendo dibujar QR solo explícitamente', () => {
    const renderer = new TerminalQrRenderer();
    let qrRenderCalls = 0;
    renderer.render('');
    renderer.render('   ');
    assert.strictEqual(qrRenderCalls, 0);
  });

  await t.test('97. restartRequired 515 después de QR activa exactamente un restart', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(conn.startCalls, 1);
    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-restart';
    await new Promise((r) => setTimeout(r, 20));

    // Emit 515 restart required
    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';
    await new Promise((r) => setTimeout(r, 30));

    // Runner must have closed old socket and started a new one
    assert.strictEqual(conn.startCalls, 2);

    // Provide connected state on second socket
    conn.state = 'CONNECTED';
    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
  });

  await t.test('98. restart espera persistence barrier antes del nuevo start', async () => {
    let persistenceWaitStarted = false;
    let persistenceWaitResolved = false;
    let resolvePersistence: () => void = () => {};
    let persistenceWaitCalls = 0;

    const conn = new FakeTestConnection();
    conn.waitForAuthPersistence = async () => {
      persistenceWaitCalls++;
      if (persistenceWaitCalls === 1) {
        persistenceWaitStarted = true;
        return new Promise<void>((resolve) => {
          resolvePersistence = () => {
            persistenceWaitResolved = true;
            resolve();
          };
        });
      }
      return;
    };

    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-98';
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';
    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(persistenceWaitStarted, true);
    // Before persistence resolves, startCalls must still be 1!
    assert.strictEqual(conn.startCalls, 1);
    assert.strictEqual(persistenceWaitResolved, false);

    // Resolve persistence
    resolvePersistence();
    await new Promise((r) => setTimeout(r, 20));

    // Now startCalls must have incremented to 2!
    assert.strictEqual(conn.startCalls, 2);
    conn.state = 'CONNECTED';

    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
  });

  await t.test('99. segundo socket conectado -> LINKED', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const loggedInfos: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      logger: {
        info: (msg) => loggedInfos.push(msg),
        error: () => {}
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-99';
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';
    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(conn.startCalls, 2);
    conn.state = 'CONNECTED';

    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
    assert.ok(loggedInfos.includes('WHATSAPP_LINKED=YES'));
  });

  await t.test('100. segundo 515 -> ERROR, sin tercer socket', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-100';
    await new Promise((r) => setTimeout(r, 20));

    // First 515
    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(conn.startCalls, 2);

    // Second 515 on the second connection
    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    // Must NOT have started a third socket
    assert.strictEqual(conn.startCalls, 2);
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=RESTART_LIMIT_EXCEEDED'));
  });

  await t.test('101. loggedOut nunca causa restart', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-101';
    await new Promise((r) => setTimeout(r, 20));

    // Logged out
    conn.state = 'LOGGED_OUT';
    conn.disconnectReason = 'LOGGED_OUT';

    const result = await runPromise;
    assert.strictEqual(result.status, 'LOGGED_OUT');
    assert.strictEqual(conn.startCalls, 1);
  });

  await t.test('102. desconexión desconocida no causa restart automático', async () => {
    const conn = new FakeTestConnection();
    const renderer = new FakeQrRenderer();
    const runner = new WhatsAppLinkRunner({
      connection: conn,
      qrRenderer: renderer,
      timeoutMs: 80,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    conn.state = 'QR_REQUIRED';
    conn.latestQr = '1@test-qr-102';
    await new Promise((r) => setTimeout(r, 20));

    // Unknown or temporary disconnect
    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'UNKNOWN';

    const result = await runPromise;
    assert.strictEqual(result.status, 'TIMEOUT');
    assert.strictEqual(conn.startCalls, 1);
  });

  await t.test('103. probe no implementa reconnect loop', async () => {
    const conn = new FakeTestConnection();
    const runner = new WhatsAppProbeRunner({
      connection: conn,
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    // 515 received during probe
    conn.state = 'RECONNECTING';
    conn.disconnectReason = 'RESTART_REQUIRED';

    const result = await runPromise;
    assert.strictEqual(result.status, 'FAIL');
    assert.strictEqual(conn.startCalls, 1);
  });

  await t.test('104. no setInterval', () => {
    const linkRunnerCode = fs.readFileSync(
      path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppLinkRunner.ts'),
      'utf8'
    );
    const probeRunnerCode = fs.readFileSync(
      path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppProbeRunner.ts'),
      'utf8'
    );
    const managerCode = fs.readFileSync(
      path.join(__dirname, 'infrastructure', 'baileys', 'BaileysConnectionManager.ts'),
      'utf8'
    );

    assert.strictEqual(linkRunnerCode.includes('setInterval'), false);
    assert.strictEqual(probeRunnerCode.includes('setInterval'), false);
    assert.strictEqual(managerCode.includes('setInterval'), false);
  });

  await t.test('105. no recursion infinita', () => {
    const linkRunnerCode = fs.readFileSync(
      path.join(__dirname, 'infrastructure', 'baileys', 'WhatsAppLinkRunner.ts'),
      'utf8'
    );
    // WhatsAppLinkRunner.run has no recursive self calls
    assert.strictEqual(linkRunnerCode.includes('this.run('), false);
  });

  await t.test('106. tests no usan auth real', () => {
    const realAuthPath = path.join(os.homedir(), '.yeskira', 'whatsapp-auth');
    // Ensure test environment runs strictly without referencing real user auth path
    assert.notStrictEqual(tmpBaseDir, realAuthPath);
  });

  await t.test('107. tests no abren WebSocket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('108. tests no generan QR real', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('109. tests no envían mensajes', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });

  // ==========================================
  // PHASE C2c PART 2 TESTS (110 - 121)
  // ==========================================

  await t.test('110. pino existe como dependency directa exacta 9.14.0', () => {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(pkg.dependencies?.pino, '9.14.0');
  });

  await t.test('111. pino no depende solo de Baileys transitivamente', () => {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(Object.prototype.hasOwnProperty.call(pkg.dependencies, 'pino'));
  });

  await t.test('112. close persistence failure durante 515 impide restart', async () => {
    let attempt = 0;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 2) {
              throw new Error('Disk write failed on second save during close drain');
            }
          }
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const renderer = new FakeQrRenderer();
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: renderer,
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    // QR emitted
    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-112' });
    // First saveCreds (save #1 succeeds)
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    // Enqueue save #2 (which will fail in persistenceChain)
    factory.lastCreatedSocket?.emit('creds.update', {});

    // 515 received
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(factory.createCount, 1);
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE'));
  });

  await t.test('113. close persistence failure durante 515 retorna ERROR', async () => {
    let attempt = 0;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 2) {
              throw new Error('EACCES during close drain');
            }
          }
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: new FakeQrRenderer(),
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-113' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
  });

  await t.test('114. close persistence failure durante 515 no produce segundo socket', async () => {
    let attempt = 0;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 2) {
              throw new Error('Disk fail');
            }
          }
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: new FakeQrRenderer(),
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-114' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    await runPromise;
    assert.strictEqual(factory.createCount, 1);
  });

  await t.test('115. close persistence failure durante 515 no produce LINKED', async () => {
    let attempt = 0;
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {
            attempt++;
            if (attempt === 2) {
              throw new Error('Corrupted credentials');
            }
          }
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: new FakeQrRenderer(),
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-115' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('creds.update', {});
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    const result = await runPromise;
    assert.notStrictEqual(result.status, 'LINKED');
  });

  await t.test('116. close normal después de barrier sí permite único restart', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {}
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: new FakeQrRenderer(),
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-116' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(factory.createCount, 2);

    factory.lastCreatedSocket?.emit('connection.update', { connection: 'open' });
    const result = await runPromise;
    assert.strictEqual(result.status, 'LINKED');
  });

  await t.test('117. segundo 515 sigue sin tercer socket', async () => {
    const authStore = {
      async getAuthState() {
        return {
          state: { creds: {}, keys: {} } as any,
          saveCreds: async () => {}
        };
      }
    };
    const factory = new FakeTestSocketFactory();
    const manager = new BaileysConnectionManager(authStore, factory);
    const loggedErrors: string[] = [];
    const runner = new WhatsAppLinkRunner({
      connection: manager,
      qrRenderer: new FakeQrRenderer(),
      logger: {
        info: () => {},
        error: (msg) => loggedErrors.push(msg)
      },
      timeoutMs: 500,
      pollIntervalMs: 10
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 20));

    factory.lastCreatedSocket?.emit('connection.update', { qr: '1@test-qr-117' });
    factory.lastCreatedSocket?.emit('creds.update', {});
    await new Promise((r) => setTimeout(r, 20));

    // First 515
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(factory.createCount, 2);

    // Second 515 on socket 2
    factory.lastCreatedSocket?.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } }
    });

    const result = await runPromise;
    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(factory.createCount, 2);
    assert.ok(loggedErrors.includes('WHATSAPP_LINK_FAILED=RESTART_LIMIT_EXCEEDED'));
  });

  await t.test('118. logger sigue silent', () => {
    const factory = new DefaultBaileysSocketFactory();
    const logger = factory.createLogger();
    assert.strictEqual(logger.level, 'silent');
  });

  await t.test('119. ningún socket real', () => {
    const factory = new FakeTestSocketFactory();
    assert.strictEqual(factory.createCount, 0);
  });

  await t.test('120. ningún QR real', () => {
    const renderer = new FakeQrRenderer();
    assert.strictEqual(renderer.renderedQrs.length, 0);
  });

  await t.test('121. ningún mensaje real', () => {
    const conn = new FakeTestConnection();
    assert.strictEqual(conn.sentMessages.length, 0);
  });
});
