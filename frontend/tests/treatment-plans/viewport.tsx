import { createRoot } from 'react-dom/client';
import { TreatmentPlanSection } from '../../src/features/treatment-plans/TreatmentPlanSection';
import './styles.css';

const id = '00000000-0000-4000-8000-000000000001';
let treatments: any[] = []; let budgets: any[] = [];
const requests: Array<{ path: string; body: any }> = [];
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, body });
  let result: unknown;
  if (path.endsWith('/dental-procedures')) result = [{ id, name: 'Resina de catálogo', defaultPrice: '123.45', description: 'Descripción del catálogo', active: true, version: 1 }];
  else if (path.endsWith('/professionals')) result = [];
  else if (path.endsWith('/treatment-plan')) result = { treatments, budgets, totals: { planned: treatments.length ? '123.45' : '0', accepted: '0', completed: '0', pending: treatments.length ? '123.45' : '0' } };
  else if (path.endsWith('/treatments')) { const t = { ...body, id, version: 1, createdAt: '2026-09-07T12:00:00Z' }; treatments = [t]; result = t; }
  else if (path.endsWith('/budgets')) { const b = { id, version: 1, status: 'DRAFT', subtotal: '123.45', discount: body.discount, total: '100.05', items: treatments, createdAt: '2026-09-07T12:00:00Z' }; budgets = [b]; result = b; }
  else if (path.endsWith(`/budgets/${id}`)) { budgets = budgets.map(b => ({ ...b, status: body.status, version: b.version + 1 })); result = budgets[0]; }
  else throw new Error('Ruta inesperada: ' + path);
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const root = createRoot(document.getElementById('root')!);
const results: string[] = [];
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); results.push(message); };
const tick = () => new Promise(r => setTimeout(r, 40));
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
async function run() {
  root.render(<TreatmentPlanSection patientId={id} initialTooth={16} />);
  await tick(); await tick();
  let dialog = document.querySelector('[role="dialog"]')!;
  check(dialog, 'Abrir tratamiento desde pieza dental');
  const selects = dialog.querySelectorAll('select');
  check([...selects].some(s => s.value === '16'), 'Pieza FDI preseleccionada');
  const catalog = selects[0]!;
  catalog.value = id; catalog.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  check((dialog.querySelector('input[type="number"]') as HTMLInputElement).value === '123.45', 'Catálogo carga precio sugerido');
  button('Guardar tratamiento').click(); await tick(); await tick();
  check(!document.querySelector('[role="dialog"]'), 'Guardar cierra formulario');
  check(treatments[0]?.toothNumber === 16 && treatments[0]?.name === 'Resina de catálogo', 'Solicitud conserva pieza y procedimiento');
  const checkbox = document.querySelector('input[aria-label^="Incluir"]') as HTMLInputElement;
  checkbox.click(); await tick();
  const discount = document.querySelector('input[type="number"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(discount, '23.40');
  discount.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  button('Guardar presupuesto').click(); await tick(); await tick();
  const request = requests.find(r => r.path.endsWith('/budgets') && r.body);
  check(request?.body.discount === '23.40' && request.body.treatmentIds[0] === id, 'Presupuesto envía selección y descuento');
  const details = document.querySelector('details')!; details.open = true;
  button('Presentado').click(); await tick(); await tick();
  check(budgets[0]?.status === 'PRESENTED', 'Presupuesto cambia a presentado');
  root.render(<TreatmentPlanSection key="readonly" patientId={id} readOnly />); await tick(); await tick();
  check(!button('Agregar tratamiento') && !button('Guardar presupuesto'), 'Paciente inactivo muestra vista de solo lectura');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'Sin desbordamiento horizontal');
  document.body.dataset.treatmentTests = 'passed';
}
run().catch(e => { results.push('FAIL ' + e.message); document.body.dataset.treatmentTests = 'failed'; }).finally(() => { document.getElementById('treatment-test-results')!.textContent = results.join('\n'); });
