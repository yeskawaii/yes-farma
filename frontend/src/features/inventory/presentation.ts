export { buttonClass, secondaryButtonClass, fieldClass } from '../treatment-plans/presentation';
export const labels = { ENTRY: 'Entrada', CONSUMPTION: 'Consumo', WASTE: 'Merma', ADJUSTMENT_IN: 'Ajuste +', ADJUSTMENT_OUT: 'Ajuste -' };
export const actions = { ENTRY: 'Registrar entrada', CONSUMPTION: 'Registrar consumo', WASTE: 'Registrar merma', ADJUSTMENT_IN: 'Registrar ajuste +', ADJUSTMENT_OUT: 'Registrar ajuste -' };
export const categories = ['Anestesia', 'Restauración', 'Endodoncia', 'Cirugía', 'Ortodoncia', 'Protección personal', 'Limpieza', 'Consumibles', 'Laboratorio', 'Otros'];
export const dateLabel = (v: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(v));
export const costLabel = (v: string | null) => v === null ? 'Sin registrar' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v));
