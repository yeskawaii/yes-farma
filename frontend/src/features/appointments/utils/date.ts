export const CLINIC_TIME_ZONE = 'America/Mexico_City';

// Representación interna de fecha civil (YYYY-MM-DD)
export type CivilDate = string;

// Helper: Crear Intl.DateTimeFormat para la zona clínica
const createFormatter = (options: Intl.DateTimeFormatOptions) => {
  return new Intl.DateTimeFormat('es-MX', { ...options, timeZone: CLINIC_TIME_ZONE });
};

export function getCivilDate(dateOrIso?: Date | string): CivilDate {
  const date = dateOrIso ? new Date(dateOrIso) : new Date();
  const formatter = createFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  const y = getPart('year');
  const m = getPart('month')?.padStart(2, '0');
  const d = getPart('day')?.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Devuelve el Date exacto que representa la medianoche de una fecha civil en la zona clínica
export function civilDateToUtcMidnight(civilDate: CivilDate): Date {
  const [year, month, day] = civilDate.split('-').map(Number);

  // Usamos aproximación y ajustamos. Una forma robusta sin librerías:
  // Creamos la fecha asumiendo UTC, y luego vemos su desfase en la zona clínica
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  // Ajuste iterativo hasta que la hora local en la clínica sea 00:00:00
  for (let i = 0; i < 24; i++) {
    date.setUTCHours(date.getUTCHours() - 1);
    const parts = createFormatter({ hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    if (hour === 0) {
      break;
    }
  }
  // En este punto, 'date' es la medianoche de ese día en la zona clínica.
  return date;
}

// Suma o resta días a una fecha civil y devuelve otra fecha civil
export function addDaysCivil(civilDate: CivilDate, days: number): CivilDate {
  const midnight = civilDateToUtcMidnight(civilDate);
  midnight.setUTCDate(midnight.getUTCDate() + days); // Avanzamos usando UTC seguro (siendo mediodía / u horas seguras)
  // Nota: si sumamos sobre medianoche, cambios de DST pueden desfasar la hora. Es mejor usar mediodía.
  const noon = civilDateToUtcMidnight(civilDate);
  noon.setUTCHours(12);
  noon.setUTCDate(noon.getUTCDate() + days);
  return getCivilDate(noon);
}

// Obtiene el lunes de la semana dada una fecha civil
export function getStartOfWeekCivil(civilDate: CivilDate): CivilDate {
  const noon = civilDateToUtcMidnight(civilDate);
  noon.setUTCHours(12);
  // Mejor usamos un Date real para saber el día de la semana, aunque la hora puede variar.
  // Como usamos mediodía, el getUTCDay() coincidirá con el día clínico.
  let dayOfWeek = noon.getUTCDay(); // 0 = Dom, 1 = Lun

  // Queremos que la semana inicie el Lunes (1)
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDaysCivil(civilDate, -diff);
}

// Rangos semiabiertos para Día
export function getDailyRange(civilDate: CivilDate): { startAt: string; endAt: string } {
  const start = civilDateToUtcMidnight(civilDate);
  const nextDay = addDaysCivil(civilDate, 1);
  const end = civilDateToUtcMidnight(nextDay);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

// Rangos semiabiertos para Semana
export function getWeeklyRange(civilDate: CivilDate): { startAt: string; endAt: string } {
  const startOfWeek = getStartOfWeekCivil(civilDate);
  const nextWeek = addDaysCivil(startOfWeek, 7);
  const start = civilDateToUtcMidnight(startOfWeek);
  const end = civilDateToUtcMidnight(nextWeek);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return createFormatter({ hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return createFormatter({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export function formatShortDateCivil(civilDate: CivilDate): string {
  const d = civilDateToUtcMidnight(civilDate);
  d.setUTCHours(12); // Para formatear sin riesgo
  return createFormatter({ weekday: 'short', day: 'numeric' }).format(d);
}

export function civilDateAndTimeToIso(civilDate: CivilDate, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) {
    throw new Error('Formato de fecha inválido. Se esperaba YYYY-MM-DD');
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Formato de hora inválido. Se esperaba HH:mm');
  }

  const [year, month, day] = civilDate.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Fecha fuera de rango');
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Hora fuera de rango');
  }

  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    throw new Error('La fecha especificada no existe en el calendario');
  }

  // Buscar el offset correcto a partir del aproximado (-6 horas)
  const d = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  d.setUTCHours(d.getUTCHours() + 6); // America/Mexico_City suele ser UTC-6

  for (let i = -3; i <= 3; i++) {
    const candidate = new Date(d.getTime() + i * 3600000);
    const parts = createFormatter({
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }).formatToParts(candidate);

    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
    const cYear = parseInt(getPart('year'), 10);
    const cMonth = parseInt(getPart('month'), 10);
    const cDay = parseInt(getPart('day'), 10);
    const cHour = parseInt(getPart('hour'), 10);
    const cMin = parseInt(getPart('minute'), 10);

    if (cYear === year && cMonth === month && cDay === day && cHour === hours && cMin === minutes) {
      return candidate.toISOString();
    }
  }

  throw new Error('No fue posible mapear la fecha y hora a la zona clínica');
}

// Extrae HH:mm de un ISO en la zona de la clínica
export function getClinicTime(isoDate: string): string {
  return createFormatter({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(isoDate));
}

// Devuelve la fecha civil (YYYY-MM-DD) de un ISO en la zona de la clínica
export function getClinicCivilDate(isoDate: string): CivilDate {
  return getCivilDate(isoDate);
}

// Calendar arithmetic uses civil dates, independent of the device timezone.
export function addMonthsCivil(date: CivilDate, months: number): CivilDate {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function getMonthDays(date: CivilDate): CivilDate[] {
  const first = `${date.slice(0, 7)}-01`;
  const next = addMonthsCivil(first, 1);
  const start = getStartOfWeekCivil(first);
  const last = addDaysCivil(getStartOfWeekCivil(addDaysCivil(next, -1)), 6);
  const days: CivilDate[] = [];
  for (let day = start; day <= last; day = addDaysCivil(day, 1)) days.push(day);
  return days;
}

// The existing API accepts a maximum of 35 days per request.
export function getMonthlyRanges(date: CivilDate): { startAt: string; endAt: string }[] {
  const days = getMonthDays(date);
  return [days.slice(0, 35), days.slice(35)].filter(chunk => chunk.length).map(chunk => ({
    startAt: civilDateToUtcMidnight(chunk[0]).toISOString(),
    endAt: civilDateToUtcMidnight(addDaysCivil(chunk[chunk.length - 1], 1)).toISOString(),
  }));
}

export function formatMonthCivil(date: CivilDate): string {
  return createFormatter({ month: 'long', year: 'numeric' }).format(civilDateToUtcMidnight(date));
}

export function formatCalendarDate(date: CivilDate): string {
  return createFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(civilDateToUtcMidnight(date));
}

// Only defaults are rounded; explicit selections and existing appointments are preserved.
export function getNewAppointmentStart(initialDate?: CivilDate, initialTime?: string, now = new Date()) {
  if (initialTime) return { date: initialDate || getCivilDate(now), time: initialTime };
  const [hour, minute] = getClinicTime(now.toISOString()).split(':').map(Number);
  const roundedMinutes = Math.ceil((hour * 60 + minute) / 15) * 15;
  const date = initialDate || getCivilDate(now);
  return {
    date: roundedMinutes === 1440 && !initialDate ? addDaysCivil(date, 1) : date,
    time: `${String(Math.floor(roundedMinutes / 60) % 24).padStart(2, '0')}:${String(roundedMinutes % 60).padStart(2, '0')}`,
  };
}
