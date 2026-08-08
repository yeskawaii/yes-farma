function extractParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const getPart = (type: string): string => {
    const part = parts.find(p => p.type === type);
    if (!part || !part.value) {
      throw new RangeError(`No se pudo extraer la parte '${type}' de la fecha para la zona '${timeZone}'`);
    }
    return part.value;
  };

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour') === '24' ? '00' : getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second')
  };
}

function localToUtcMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const localIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
  const utcGuess = new Date(`${localIso}Z`).getTime();

  const getOffset = (t: number) => {
    const parts = extractParts(new Date(t), timeZone);
    const dLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    return dLocal.getTime() - t;
  };

  const offset = getOffset(utcGuess);
  let result = new Date(utcGuess - offset);

  const refinedOffset = getOffset(result.getTime());
  if (refinedOffset !== offset) {
    result = new Date(utcGuess - refinedOffset);
  }

  return result;
}

export function getStartOfDay(date: Date, timeZone: string): Date {
  const parts = extractParts(date, timeZone);
  const y = parseInt(parts.year, 10);
  const m = parseInt(parts.month, 10);
  const d = parseInt(parts.day, 10);

  return localToUtcMidnight(y, m, d, timeZone);
}

export function addCalendarDays(date: Date, timeZone: string, days: number): Date {
  const start = getStartOfDay(date, timeZone);
  const parts = extractParts(start, timeZone);

  const y = parseInt(parts.year, 10);
  const m = parseInt(parts.month, 10) - 1; // JS months are 0-indexed
  const d = parseInt(parts.day, 10);

  const calendarDate = new Date(Date.UTC(y, m, d));
  calendarDate.setUTCDate(calendarDate.getUTCDate() + days);

  return localToUtcMidnight(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth() + 1, calendarDate.getUTCDate(), timeZone);
}

export function getStartOfWeek(date: Date, timeZone: string): Date {
  const start = getStartOfDay(date, timeZone);
  const parts = extractParts(start, timeZone);

  const y = parseInt(parts.year, 10);
  const m = parseInt(parts.month, 10) - 1;
  const d = parseInt(parts.day, 10);

  const localDate = new Date(Date.UTC(y, m, d));
  const localWeekday = (localDate.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun

  localDate.setUTCDate(localDate.getUTCDate() - localWeekday);

  return localToUtcMidnight(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(), timeZone);
}
