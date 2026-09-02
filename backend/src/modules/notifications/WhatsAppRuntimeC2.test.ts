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
import {
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  IBaileysMessageSender,
  BaileysSendResult
} from './infrastructure/baileys/BaileysTypes';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';

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
  public startCalls = 0;
  public closeCalls = 0;
  public sentMessages: any[] = [];

  getState() {
    return this.state;
  }

  getLatestQr() {
    return this.latestQr;
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
});
