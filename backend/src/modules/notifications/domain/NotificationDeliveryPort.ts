import {
  NotificationDeliveryParams,
  NotificationDeliveryResult
} from './NotificationTypes';

export interface INotificationDeliveryPort {
  deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult>;
}
