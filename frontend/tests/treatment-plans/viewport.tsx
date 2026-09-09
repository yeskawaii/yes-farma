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
  else if (path.endsWith('/print')) result = {clinic:{name:'Clínica de prueba',timeZone:'America/Mexico_City'},patient:{firstName:'Paciente',lastName:'Prueba',secondLastName:null},budget:budgets[0]};
  else if (path.endsWith(`/budgets/${id}`)) { budgets = budgets.map(b => ({ ...b, ...(body.status ? {status:body.status} : {discount:body.discount,total:((12345-Math.round(Number(body.discount)*100))/100).toFixed(2)}), version: b.version + 1 })); result = budgets[0]; }
  else throw new Error('Ruta inesperada: ' + path);
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const root = createRoot(document.getElementById('root')!);
const results: string[] = [];
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); results.push(message); };
const tick = () => new Promise(r => setTimeout(r, 40));
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
const review = new URLSearchParams(location.search).get('review');
async function checkpoint(name: string) {
  check(document.documentElement.scrollWidth <= window.innerWidth, `Sin overflow: ${name}`);
  if (review === name) { document.body.dataset.review = name; await new Promise(() => {}); }
}
async function run() {
  if (review === 'empty') { root.render(<TreatmentPlanSection patientId={id} />); await tick(); await tick(); await checkpoint('empty'); }

  root.render(<TreatmentPlanSection patientId={id} initialTooth={16} />);
  await tick(); await tick();
  let dialog = document.querySelector('[role="dialog"]')!;
  check(dialog, 'Abrir tratamiento desde pieza dental');
  await checkpoint('treatment');
  check(dialog.contains(document.activeElement), 'Foco inicial dentro del modal');
  const close = button('Cancelar'); close.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})); await tick();
  check(!document.querySelector('[role="dialog"]'), 'Escape cierra formulario clínico'); button('Agregar tratamiento').click(); await tick(); dialog = document.querySelector('[role="dialog"]')!;
  const selects = dialog.querySelectorAll('select');
  check([...selects].some(s => s.value === '16'), 'Pieza FDI preseleccionada');
  const catalog = selects[0]!;
  catalog.value = id; catalog.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  check((dialog.querySelector('input[type="number"]') as HTMLInputElement).value === '123.45', 'Catálogo carga precio sugerido');
  button('Guardar tratamiento').click(); await tick(); await tick();
  check(!document.querySelector('[role="dialog"]'), 'Guardar cierra formulario');
  check(treatments[0]?.toothNumber === 16 && treatments[0]?.name === 'Resina de catálogo', 'Solicitud conserva pieza y procedimiento');
  await checkpoint('plan');
  check(!document.querySelector('input[aria-label^="Incluir"]'), 'Plan clínico separado de selección financiera');
  button('2. Presupuestos').click(); await tick(); button('Crear presupuesto').click(); await tick();
  await checkpoint('create');
  const checkbox = document.querySelector('input[aria-label^="Incluir"]') as HTMLInputElement;
  checkbox.click(); await tick();
  const discount = document.querySelector('input[type="number"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(discount, '23.40');
  discount.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  await checkpoint('discount');
  button('Guardar presupuesto').click(); await tick(); await tick();
  const request = requests.find(r => r.path.endsWith('/budgets') && r.body);
  check(request?.body.discount === '23.40' && request.body.treatmentIds[0] === id, 'Presupuesto envía selección y descuento');
  await checkpoint('edit');
  check(document.querySelector('[role="dialog"]'), 'Guardar presupuesto permanece en edición');
  button('Cerrar').click(); await tick(); await tick();
  const details = document.querySelector('details')!; details.open = true;
  button('Editar presupuesto').click(); await tick();
  check(document.body.textContent?.includes('monto fijo ($ MXN)'), 'Modalidad de descuento visible');
  button('Quitar descuento').click(); await tick();
  check(document.querySelector('[role="dialog"]')?.textContent?.includes('$123.45'), 'Quitar descuento recalcula total');
  const editDiscount = document.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement;
  const setDiscount = async (value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(editDiscount,value); editDiscount.dispatchEvent(new Event('input',{bubbles:true})); await tick(); };
  await setDiscount('3.40');
  let opened = 0; let printed = '';
  window.open = (() => { opened++; return {opener:null,document:{body:{textContent:''},open(){},write(html:string){printed=html;},close(){}},close(){}}; }) as any;
  button('Guardar cambios').click(); await tick(); await tick();
  check(budgets.length === 1 && budgets[0].total === '120.05' && opened === 0, 'Corregir descuento conserva presupuesto y guardar no imprime');
  button('Cerrar').click(); await tick(); await tick();
  const mutations = requests.filter(r => r.body).length;
  button('Imprimir presupuesto').click(); await tick(); await tick();
  check(opened === 1 && printed.includes('$120.05') && requests.filter(r => r.body).length === mutations, 'Imprimir usa total corregido y no guarda');
  button('Editar presupuesto').click(); await tick();
  const restored = document.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(restored,'23.40');restored.dispatchEvent(new Event('input',{bubbles:true}));await tick();
  button('Guardar cambios').click(); await tick(); await tick(); button('Cerrar').click(); await tick(); await tick();
  button('Marcar como presentado').click(); await tick(); await tick();
  check(budgets[0]?.status === 'PRESENTED', 'Presupuesto cambia a presentado');
  button('Aceptar presupuesto').click(); await tick(); await tick();
  check(button('Editar presupuesto').disabled && document.body.textContent?.includes('aceptado y no puede editarse'), 'Aceptado bloquea edición con explicación');
  await checkpoint('accepted');
  button('Registrar abono').click(); await tick(); await tick();
  check(document.body.textContent?.includes('Saldo pendiente:'), 'Modal muestra saldo inicial');
  const amount = document.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement;
  const changeAmount = async (value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(amount,value);amount.dispatchEvent(new Event('input',{bubbles:true}));await tick(); };
  await changeAmount('0');check([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Registrar abono'))!.disabled,'Monto cero deshabilita guardar');
  await changeAmount('101');check([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Registrar abono'))!.disabled,'Sobreabono deshabilita guardar');
  await changeAmount('40.05');[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Registrar abono'))!.click();await tick();await tick();
  check(budgets[0].balance==='60.00' && document.body.textContent?.includes('Parcialmente pagado'),'Abono parcial refresca saldo e historial');
  await checkpoint('partial');
  (document.querySelector('[role="dialog"] details') as HTMLDetailsElement).open = true;
  button('Cancelar pago').click();await tick();
  const reason=document.querySelector('[role="dialog"] textarea[maxlength="500"]') as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Duplicado');reason.dispatchEvent(new Event('input',{bubbles:true}));await tick();button('Confirmar cancelación').click();await tick();await tick();
  check(document.body.textContent?.includes('Duplicado') && budgets[0].balance==='100.05','Cancelación visible y saldo restaurado');
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Registrar abono'))!.click();await tick();await tick();
  check(budgets[0].balance==='0.00' && ![...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Registrar abono'))!,'Pago completo cierra captura');
  await checkpoint('paid');
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
