export const CLINIC_TIME_ZONE = 'America/Mexico_City';

// Representación interna de fecha civil (YYYY-MM-DD)
export type CivilDate = string;

// Helper: Crear Intl.DateTimeFormat para la zona clínica
const createFormatter = (options: Intl.DateTimeFormatOptions) => {
  return new Intl.DateTimeFormat('es-MX', { ...options, timeZone: CLINIC_TIME_ZONE });
};

// Convierte un objeto Date o ISO string a YYYY-MM-DD en la zona clínica
export function getCivilDate(dateOrIso?: Date | string): CivilDate {
  const date = dateOrIso ? new Date(dateOrIso) : new Date();
  const formatter = createFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' });
  // El formato devuelto suele ser DD/MM/YYYY, así que lo parseamos
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
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
