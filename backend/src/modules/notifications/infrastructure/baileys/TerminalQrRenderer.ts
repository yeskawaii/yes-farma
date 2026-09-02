import qrcode from 'qrcode-terminal';
import { IQrRenderer } from './IQrRenderer';

export class TerminalQrRenderer implements IQrRenderer {
  render(qr: string): void {
    if (!qr || typeof qr !== 'string' || qr.trim() === '') {
      return;
    }
    qrcode.generate(qr, { small: true });
  }
}
