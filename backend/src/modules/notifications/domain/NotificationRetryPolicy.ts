export interface IRetryPolicy {
  readonly maxAttempts: number;
  calculateNextAttempt(attempts: number, now: Date): Date;
  canRetry(attempts: number, nextAttemptAt: Date, expiresAt?: Date | null): boolean;
}

export class NotificationRetryPolicy implements IRetryPolicy {
  readonly maxAttempts: number;

  constructor(maxAttempts = 8) {
    this.maxAttempts = maxAttempts;
  }

  /**
   * Calculates the next attempt timestamp based on attempt count.
   *
   * Attempt 1: +1 min
   * Attempt 2: +2 min
   * Attempt 3: +5 min
   * Attempt 4: +10 min
   * Attempt 5+: +30 min
   */
  calculateNextAttempt(attempts: number, now: Date): Date {
    let delayMs: number;

    switch (attempts) {
      case 1:
        delayMs = 1 * 60 * 1000; // 1 min
        break;
      case 2:
        delayMs = 2 * 60 * 1000; // 2 min
        break;
      case 3:
        delayMs = 5 * 60 * 1000; // 5 min
        break;
      case 4:
        delayMs = 10 * 60 * 1000; // 10 min
        break;
      default:
        delayMs = 30 * 60 * 1000; // 30 min
        break;
    }

    return new Date(now.getTime() + delayMs);
  }

  /**
   * Evaluates if a retry is allowed based on attempt count and expiration timestamp.
   */
  canRetry(attempts: number, nextAttemptAt: Date, expiresAt?: Date | null): boolean {
    if (attempts >= this.maxAttempts) {
      return false;
    }

    if (expiresAt && nextAttemptAt.getTime() >= expiresAt.getTime()) {
      return false;
    }

    return true;
  }
}
