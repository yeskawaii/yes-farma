import { budgetPrintHtml } from '../../src/features/treatment-plans/budgetPrint';
import { createRoot } from 'react-dom/client';
import { TreatmentPlanSection } from '../../src/features/treatment-plans/TreatmentPlanSection';
import './styles.css';

const id = '00000000-0000-4000-8000-000000000001';
let payments: any[] = [];
let treatments: any[] = []; let budgets: any[] = [];
const requests: Array<{ path: string; body: any }> = [];
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, body });
  let result: unknown;
  if (path.endsWith('/cancel')) { Object.assign(payments[0], {status:'CANCELLED', cancellationReason:body.cancellationReason,cancelledAt:new Date().toISOString()}); budgets[0].paid='0.00';budgets[0].balance='100.05';budgets[0].financialStatus='UNPAID';result=payments[0]; }
  else if (path.endsWith('/payments')) { if(body){payments.push({...body,id:String(payments.length),createdAt:new Date().toISOString(),status:'ACTIVE',createdBy:{user:{firstName:'Test',lastName:'Professional'}}});const paid=payments.filter(p=>p.status==='ACTIVE').reduce((s,p)=>s+Math.round(Number(p.amount)*100),0);Object.assign(budgets[0],{paid:(paid/100).toFixed(2),balance:((10005-paid)/100).toFixed(2),financialStatus:paid===10005?'PAID':'PARTIAL'});} result={...budgets[0],payments}; }
  else if (path.endsWith('/dental-procedures')) result = [{ id, name: 'Resina de catálogo', defaultPrice: '123.45', description: 'Descripción del catálogo', active: true, version: 1 }];
  else if (path.endsWith('/professionals')) result = [];
  else if (path.endsWith('/treatment-plan')) result = { treatments, budgets, totals: { planned: treatments.length ? '123.45' : '0', accepted: '0', completed: '0', pending: treatments.length ? '123.45' : '0' } };
  else if (path.endsWith('/treatments')) { const t = { ...body, id, version: 1, createdAt: '2026-09-07T12:00:00Z' }; treatments = [t]; result = t; }
  else if (path.endsWith('/budgets')) { const b = { id, version: 1, status: 'DRAFT', paid:'0.00',balance:'100.05',financialStatus:'UNPAID', subtotal: '123.45', discount: body.discount, total: '100.05', items: treatments, createdAt: '2026-09-07T12:00:00Z' }; budgets = [b]; result = b; }
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
  button('Aceptado').click(); await tick(); await tick();
  button('Registrar abono').click(); await tick(); await tick();
  check(document.body.textContent?.includes('Saldo pendiente:'), 'Modal muestra saldo inicial');
  const amount = document.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement;
  const changeAmount = async (value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(amount,value);amount.dispatchEvent(new Event('input',{bubbles:true}));await tick(); };
  await changeAmount('0');check(button('Guardar abono').disabled,'Monto cero deshabilita guardar');
  await changeAmount('101');check(button('Guardar abono').disabled,'Sobreabono deshabilita guardar');
  await changeAmount('40.05');button('Guardar abono').click();await tick();await tick();
  check(budgets[0].balance==='60.00' && document.body.textContent?.includes('Parcialmente pagado'),'Abono parcial refresca saldo e historial');
  button('Cancelar movimiento').click();await tick();
  const reason=document.querySelector('[role="dialog"] textarea[maxlength="500"]') as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Duplicado');reason.dispatchEvent(new Event('input',{bubbles:true}));await tick();button('Confirmar cancelación').click();await tick();await tick();
  check(document.body.textContent?.includes('Duplicado') && budgets[0].balance==='100.05','Cancelación visible y saldo restaurado');
  button('Guardar abono').click();await tick();await tick();
  check(budgets[0].balance==='0.00' && !button('Guardar abono'),'Pago completo cierra captura');
  check(document.documentElement.scrollWidth<=window.innerWidth,'Modal de pagos sin overflow');
  button('Cerrar').click();await tick();
  for(const count of [1,40]) for(const paid of ['0.00','40.05','100.05']) {
    const html=budgetPrintHtml({clinic:{name:'Clínica de prueba',timeZone:'America/Mexico_City'},patient:{firstName:'Nombre largo '.repeat(8),lastName:'Paciente',secondLastName:null},budget:{...budgets[0],paid,balance:(100.05-Number(paid)).toFixed(2),items:Array.from({length:count},(_,i)=>({...treatments[0],id:String(i),toothNumber:i%2?null:16,name:'Procedimiento largo '.repeat(5),description:'<script>no ejecutar</script>'}))}});
    check(html.includes('@media print') && html.includes('button,.instructions{display:none}') && !html.includes('<nav') && html.includes('&lt;script&gt;'),`Documento seguro sin navegación: ${count} filas / pagado ${paid}`);
  }
  root.render(<TreatmentPlanSection key="readonly" patientId={id} readOnly />); await tick(); await tick();
  check(!button('Agregar tratamiento') && !button('Guardar presupuesto'), 'Paciente inactivo muestra vista de solo lectura');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'Sin desbordamiento horizontal');
  document.body.dataset.treatmentTests = 'passed';
}
run().catch(e => { results.push('FAIL ' + e.message); document.body.dataset.treatmentTests = 'failed'; }).finally(() => { document.getElementById('treatment-test-results')!.textContent = results.join('\n'); });
