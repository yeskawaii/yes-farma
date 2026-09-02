import { INotificationDeliveryPort } from '../domain/NotificationDeliveryPort';
import {
  NotificationDeliveryParams,
  NotificationDeliveryResult
} from '../domain/NotificationTypes';

export class FakeNotificationDeliveryAdapter implements INotificationDeliveryPort {
  public deliveries: NotificationDeliveryParams[] = [];
  private resultsQueue: NotificationDeliveryResult[] = [];
  private defaultResult: NotificationDeliveryResult = {
    status: 'SENT',
    providerMessageId: 'fake-msg-id-default'
  };
  private errorToThrow: Error | null = null;

  setDefaultResult(result: NotificationDeliveryResult): void {
    this.defaultResult = result;
  }

  enqueueResult(result: NotificationDeliveryResult): void {
    this.resultsQueue.push(result);
  }

  setThrowError(error: Error | null): void {
    this.errorToThrow = error;
  }

  clear(): void {
    this.deliveries = [];
    this.resultsQueue = [];
    this.errorToThrow = null;
  }

  async deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult> {
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    this.deliveries.push({ ...params });

    if (this.resultsQueue.length > 0) {
      return this.resultsQueue.shift()!;
    }

    if (this.defaultResult.status === 'SENT') {
      return {
        status: 'SENT',
        providerMessageId: this.defaultResult.providerMessageId || `fake-msg-${this.deliveries.length}`
      };
    }

    return { ...this.defaultResult };
  }
}
