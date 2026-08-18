import { getEmailConfig } from '../../../config/env';
import { ResendTransactionalEmailService } from './ResendTransactionalEmailService';
import { TransactionalEmailService } from './TransactionalEmailService';

let cachedService: TransactionalEmailService | null = null;

export const getTransactionalEmailService =
  (): TransactionalEmailService => {
    if (!cachedService) {
      const config = getEmailConfig();

      cachedService = new ResendTransactionalEmailService({
        apiKey: config.apiKey,
        from: config.from,
        timeoutMs: config.timeoutMs,
      });
    }

    return cachedService;
  };
