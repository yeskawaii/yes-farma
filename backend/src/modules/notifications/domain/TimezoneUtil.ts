export interface LocalDayRangeUtc {
  startUtc: Date;
  endUtc: Date;
}

export class TimezoneUtil {
  static isValidTimezone(timeZone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  static getLocalYMD(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  }

  static formatLocalDate(
    date: Date,
    timeZone: string,
    locale = 'es-MX'
  ): string {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return formatter.format(date);
  }

  static formatShortLocalDate(
    date: Date,
    timeZone: string,
    locale = 'es-MX'
  ): string {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: 'numeric',
      month: 'long'
    });
    return formatter.format(date);
  }

  static formatLocalTime(
    date: Date,
    timeZone: string,
    locale = 'es-MX'
  ): string {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return formatter.format(date);
  }

  static formatLocalTime24h(
    date: Date,
    timeZone: string
  ): string {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      hour12: false
    });
    return formatter.format(date);
  }

  static localYMDAndTimeToUtc(
    ymd: string,
    time: string,
    timeZone: string
  ): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new Error(`Invalid local date format (expected YYYY-MM-DD): ${ymd}`);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error(`Invalid local time format (expected HH:MM 24h): ${time}`);
    }
    if (!this.isValidTimezone(timeZone)) {
      throw new Error(`Invalid IANA timezone: ${timeZone}`);
    }

    const ymdParts = ymd.split('-');
    const timeParts = time.split(':');

    const year = parseInt(ymdParts[0]!, 10);
    const month = parseInt(ymdParts[1]!, 10);
    const day = parseInt(ymdParts[2]!, 10);
    const hour = parseInt(timeParts[0]!, 10);
    const minute = parseInt(timeParts[1]!, 10);

    // Strict civil date validation
    const civil = new Date(Date.UTC(year, month - 1, day));
    if (
      civil.getUTCFullYear() !== year ||
      civil.getUTCMonth() !== month - 1 ||
      civil.getUTCDate() !== day
    ) {
      throw new Error(`Invalid civil date: ${ymd}`);
    }

    const baseUtcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

    // Collect candidate UTC offsets for the target day
    const candidateOffsets = new Set<number>();
    for (let k = -15; k <= 15; k++) {
      const sample = new Date(baseUtcMillis + k * 3600000);
      const parts = this.getZonedParts(sample, timeZone);
      const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
      candidateOffsets.add(localAsUtc - sample.getTime());
    }

    // Find UTC timestamps that represent this exact local time
    const matchingUtcMillis: number[] = [];
    for (const offset of candidateOffsets) {
      const candidateUtcMillis = baseUtcMillis - offset;
      const candidateParts = this.getZonedParts(new Date(candidateUtcMillis), timeZone);
      if (
        candidateParts.year === year &&
        candidateParts.month === month &&
        candidateParts.day === day &&
        candidateParts.hour === hour &&
        candidateParts.minute === minute
      ) {
        if (!matchingUtcMillis.includes(candidateUtcMillis)) {
          matchingUtcMillis.push(candidateUtcMillis);
        }
      }
    }

    if (matchingUtcMillis.length === 0) {
      throw new Error(`Nonexistent local time due to DST spring-forward: ${ymd} ${time} in ${timeZone}`);
    }

    // Sort chronologically ascending
    matchingUtcMillis.sort((a, b) => a - b);

    // Deterministic policy: select the earliest UTC instant
    return new Date(matchingUtcMillis[0]!);
  }

  static getLocalDayRangeUtc(date: Date, timeZone: string): LocalDayRangeUtc {
    const ymd = this.getLocalYMD(date, timeZone);
    const startUtc = this.localYMDAndTimeToUtc(ymd, '00:00', timeZone);

    const ymdParts = ymd.split('-');
    const year = parseInt(ymdParts[0]!, 10);
    const month = parseInt(ymdParts[1]!, 10);
    const day = parseInt(ymdParts[2]!, 10);

    const nextCivil = new Date(Date.UTC(year, month - 1, day + 1));
    const nextYmd = nextCivil.toISOString().slice(0, 10);
    const endUtc = this.localYMDAndTimeToUtc(nextYmd, '00:00', timeZone);

    return { startUtc, endUtc };
  }

  private static getZonedParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    let year = 0;
    let month = 0;
    let day = 0;
    let hour = 0;
    let minute = 0;
    let second = 0;

    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      else if (part.type === 'month') month = parseInt(part.value, 10);
      else if (part.type === 'day') day = parseInt(part.value, 10);
      else if (part.type === 'hour') hour = parseInt(part.value, 10);
      else if (part.type === 'minute') minute = parseInt(part.value, 10);
      else if (part.type === 'second') second = parseInt(part.value, 10);
    }

    return { year, month, day, hour, minute, second };
  }
}
