import crypto from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError';
import {
  PasswordResetEmailMessage,
  TransactionalEmailService,
} from './TransactionalEmailService';

interface ResendConfig {
  apiKey: string;
  from: string;
  timeoutMs?: number;
}

interface ResendResponse {
  ok: boolean;
  status: number;
}

export type ResendFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<ResendResponse>;

const deliveryUnavailable = () =>
  new AppError(
    'EMAIL_DELIVERY_UNAVAILABLE',
    'No pudimos enviar el correo en este momento. Intenta nuevamente más tarde.',
    503,
  );

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class ResendTransactionalEmailService
  implements TransactionalEmailService
{
  private static readonly SEND_URL = 'https://api.resend.com/emails';

  private readonly timeoutMs: number;

  constructor(
    private readonly config: ResendConfig,
    private readonly fetchImpl: ResendFetch =
      globalThis.fetch as unknown as ResendFetch,
  ) {
    this.timeoutMs = config.timeoutMs ?? 5_000;

    if (!config.apiKey.trim() || !config.from.trim()) {
      throw new Error('ResendTransactionalEmailService requires apiKey and from');
    }
  }

  async sendPasswordReset(
    message: PasswordResetEmailMessage,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    const safeFirstName = escapeHtml(message.firstName);
    const safeResetUrl = escapeHtml(message.resetUrl);

    const subject = 'Restablece tu contraseña de Yeskira Salud';

    const text = [
      `Hola ${message.firstName},`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña de Yeskira Salud.',
      '',
      `Abre este enlace para continuar: ${message.resetUrl}`,
      '',
      'Si no solicitaste este cambio, puedes ignorar este correo.',
      'El enlace es temporal y solo puede utilizarse una vez.',
    ].join('\n');

    const html = [
      `<p>Hola ${safeFirstName},</p>`,
      '<p>Recibimos una solicitud para restablecer tu contraseña de Yeskira Salud.</p>',
      `<p><a href="${safeResetUrl}">Restablecer contraseña</a></p>`,
      '<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>',
      '<p>El enlace es temporal y solo puede utilizarse una vez.</p>',
    ].join('');

    /*
     * El reset URL ya contiene un token único. Hashearlo produce una
     * Idempotency-Key estable sin colocar el token crudo en el header.
     */
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${message.to}\n${message.resetUrl}`)
      .digest('hex');

    try {
      const response = await this.fetchImpl(
        ResendTransactionalEmailService.SEND_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            from: this.config.from,
            to: [message.to],
            subject,
            text,
            html,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw deliveryUnavailable();
      }
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === 'EMAIL_DELIVERY_UNAVAILABLE'
      ) {
        throw error;
      }

      throw deliveryUnavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}
