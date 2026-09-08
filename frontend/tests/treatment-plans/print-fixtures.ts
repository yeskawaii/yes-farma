import { writeFile, mkdir } from 'node:fs/promises';
import { budgetPrintHtml } from '../../src/features/treatment-plans/budgetPrint';
const directory = '/tmp/yeskira-budget-print-review';
await mkdir(directory, { recursive: true });
for (const count of [1, 40]) for (const paid of ['0.00', '40.05', '100.05']) {
  const html = budgetPrintHtml({ clinic: { name: 'Clínica Dental · Documento de prueba', timeZone: 'America/Mexico_City' }, patient: { firstName: 'María Fernanda Alejandra', lastName: 'Hernández de la Vega', secondLastName: 'Rodríguez del Campo' }, budget: {
    id: 'fixture', folio: 'P-PRUEBA-2026', version: 1, status: 'ACCEPTED', subtotal: '123.45', discount: '23.40', total: '100.05', paid, balance: (100.05 - Number(paid)).toFixed(2), createdAt: '2026-09-08T18:00:00Z',
    items: Array.from({ length: count }, (_, i) => ({ id: String(i), name: i % 2 ? 'Valoración y seguimiento del plan de tratamiento integral' : 'Restauración con resina', description: 'Descripción administrativa del procedimiento presupuestado. Información de prueba sin datos reales.', toothNumber: i % 2 ? null : 16, surfaces: [], price: count === 1 ? '123.45' : i === 39 ? '3.33' : '3.08' })),
  } });
  await writeFile(`${directory}/${count}-${paid}.html`, html);
}
console.log(directory);
