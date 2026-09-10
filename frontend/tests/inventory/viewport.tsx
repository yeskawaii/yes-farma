import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/core/auth/AuthProvider';
import { MainLayout } from '../../src/shared/components/Layout/MainLayout';
import { InventoryPage } from '../../src/features/inventory/InventoryPage';
import { fixtures, movement, today } from './fixtures';
import type { Product } from '../../src/features/inventory/types';
import './styles.css';

let data = fixtures(); data.products = []; data.suppliers = []; data.summary = { active: 0, low: 0, empty: 0, expiring: 0, expired: 0 };
let role = 'OWNER'; let failNext = false; let holdNext = false; let release: (() => void) | undefined;
const requests: Array<{ path: string; body: Record<string, unknown> | undefined }> = [];
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, body });
  if (path.endsWith('/auth/me')) return Response.json({ user: { id: 'fixture', firstName: 'Doctora', lastName: 'Prueba', email: 'fixture@example.test' }, activeClinicId: 'fixture-clinic', activeRole: role, memberships: [] });
  if (holdNext && body) { holdNext = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (failNext) { failNext = false; return Response.json({ error: { code: 'CONCURRENCY_ERROR', message: 'El inventario cambió. Actualiza las existencias.' } }, { status: 409 }); }
  data.canManage = role === 'OWNER';
  if (path.endsWith('/inventory') && !body) {
    const active = data.products.filter(p => p.active);
    data.summary = { active: active.length, low: active.filter(p => p.stockStatus === 'LOW').length, empty: active.filter(p => p.stockStatus === 'EMPTY').length, expiring: active.filter(p => p.expiring).length, expired: active.filter(p => p.expired).length };
    return Response.json(data);
  }
  const productId = path.split('/products/')[1]?.split('/')[0];
  const p = data.products.find(p => p.id === productId);
  if (path.endsWith('/movements') && p) {
    const add = body.type === 'ENTRY' || body.type === 'ADJUSTMENT_IN';
    let lotId = body.lotId;
    if (!lotId) { lotId = `new-lot-${p.lots.length}`; p.lots.push({ id: lotId, number: body.number, expiryDate: body.expiryDate, receivedAt: body.effectiveDate, unitCost: body.unitCost, initialQuantity: body.quantity, supplier: data.suppliers[0] || null, available: '0', expiryStatus: 'NORMAL', expiryLabel: null }); }
    const l = p.lots.find(l => l.id === lotId)!;
    l.available = String(Number(l.available) + (add ? 1 : -1) * Number(body.quantity));
    p.stock = String(p.lots.reduce((s, l) => s + Number(l.available), 0)); p.usableStock = String(p.lots.filter(l => l.expiryStatus !== 'EXPIRED').reduce((s, l) => s + Number(l.available), 0)); p.version++;
    p.stockStatus = Number(p.usableStock) === 0 ? 'EMPTY' : Number(p.usableStock) < Number(p.minimumStock) ? 'LOW' : 'NORMAL';
    p.expiredStock = String(Number(p.stock) - Number(p.usableStock));
    p.expiring = p.lots.some(l => Number(l.available) > 0 && l.expiryStatus === 'EXPIRING');
    p.expired = p.lots.some(l => Number(l.available) > 0 && l.expiryStatus === 'EXPIRED');
    p.nextExpiry = p.lots.find(l => Number(l.available) > 0 && l.expiryDate && l.expiryStatus !== 'EXPIRED')?.expiryDate || null;
    const m = movement(p, body.type, body.quantity, lotId); m.reason = body.reason || (body.type === 'ENTRY' ? 'Recepción de material' : 'Uso clínico'); m.note = body.note; data.movements.unshift(m);
    return Response.json({ product: p, message: `${body.type === 'CONSUMPTION' ? 'Consumo registrado' : 'Movimiento registrado'}. Quedan ${p.usableStock} ${p.unit}.` });
  }
  if (p && body) { Object.assign(p, body, { version: p.version + 1 }); return Response.json(p); }
  if (p) return Response.json({ today, timeZone: data.timeZone, canManage: data.canManage, product: p, movements: data.movements.filter(m => m.productId === p.id) });
  if (path.endsWith('/products') && body) { const p = { ...fixtures().products[0], ...body, id: 'created', lots: [], stock: '0', usableStock: '0', stockStatus: 'EMPTY' } as Product; data.products.push(p); return Response.json(p); }
  if (path.includes('/suppliers') && body) { const id = path.split('/suppliers/')[1]; const s = data.suppliers.find(s => s.id === id); if (s) Object.assign(s, body, { version: s.version + 1 }); else data.suppliers.push({ ...body, id: 'new-supplier', version: 1 }); return Response.json(s || data.suppliers.at(-1)); }
  return Response.json({ error: { message: 'No encontrado' } }, { status: 404 });
};
const root = createRoot(document.getElementById('root')!);
function render(path = '/inventory') { root.render(<AuthProvider key={`${role}:${path}`}><MemoryRouter initialEntries={[path]}><Routes><Route element={<MainLayout />}><Route path="/inventory" element={<InventoryPage />} /><Route path="/inventory/products/:id" element={<InventoryPage />} /></Route></Routes></MemoryRouter></AuthProvider>); }
const results: string[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const check = (value: unknown, label: string) => { if (!value) throw new Error(label); results.push('PASS ' + label); };
const visible = (el: HTMLElement) => el.getClientRects().length > 0;
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text && visible(b))!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
async function waitFor(fn: () => unknown) { for (let n = 0; n < 100; n++) { if (fn()) return; await tick(); } throw new Error('Timed out waiting for interface'); }
async function click(text: string, scope: ParentNode = document) { const b = button(text, scope); if (!b) throw new Error(`Missing button: ${text}`); b.click(); await tick(); await tick(); }
async function set(selector: string, value: string, scope: ParentNode = document) { const el = scope.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!; if (!el) throw new Error(`Missing field ${selector}`); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); await tick(); }
async function openProduct(id: string) { const a = document.querySelector<HTMLAnchorElement>(`a[href="/inventory/products/${id}"]`)!; a.click(); await waitFor(() => document.querySelector('main h1')?.textContent === 'Detalle del producto' && !!button('Registrar entrada')); }
async function home() { await clickLink('Volver al inventario'); await waitFor(() => !!button('Productos')); }
async function clickLink(text: string) { [...document.querySelectorAll<HTMLAnchorElement>('a')].find(a => a.textContent?.trim() === text && visible(a))!.click(); await tick(); }
async function checkpoint(name: string) { check(document.documentElement.scrollWidth <= window.innerWidth, `Sin overflow: ${name}`); if (new URLSearchParams(location.search).get('review') === name) { document.body.dataset.review = name; await new Promise(() => {}); } }
async function run() {
  render(); await waitFor(() => !!button('Nuevo producto'));
  check(document.body.textContent?.includes('Aún no hay productos'), 'Dashboard vacío'); await checkpoint('empty');
  await click('Nuevo producto'); await set('[name="name"]', 'Nuevo material', dialog()); await set('[name="unit"]', 'ml', dialog()); await click('Crear producto', dialog()); await waitFor(() => !dialog());
  check(document.body.textContent?.includes('Producto guardado.'), 'Alta de producto con feedback');
  data = fixtures(); data.movements = [movement(data.products[1]!, 'ENTRY', '20', 'lot-articaine')]; await click('Actualizar');
  check(document.querySelectorAll('[data-product-id]').length === 5, 'Listado excluye productos inactivos');
  check(document.body.textContent?.includes('Bajo stock') && document.body.textContent?.includes('Agotado') && document.body.textContent?.includes('Próximo a caducar') && document.body.textContent?.includes('Caducado hace 5 días'), 'Dashboard muestra todos los estados y alertas');
  check(document.body.textContent?.includes('Doctora Prueba') && document.body.textContent?.includes('Fecha efectiva'), 'Movimiento muestra actor y fechas'); await checkpoint('dashboard');
  await set('input[type="search"]', 'Guantes'); check(document.querySelectorAll('[data-product-id]').length === 1, 'Búsqueda por nombre'); await set('input[type="search"]', '');
  const selects = document.querySelectorAll<HTMLSelectElement>('main select');
  await set('select', 'Anestesia', selects[0]!.parentElement!); check(document.querySelectorAll('[data-product-id]').length === 1, 'Filtro categoría'); await set('select', '', selects[0]!.parentElement!);
  for (const [state, count] of [['LOW', 1], ['EMPTY', 2], ['EXPIRING', 1], ['EXPIRED', 1]] as const) { await set('select', state, selects[1]!.parentElement!); check(document.querySelectorAll('[data-product-id]').length === count, `Filtro ${state}`); } await set('select', '', selects[1]!.parentElement!);
  (document.querySelector('main input[type="checkbox"]') as HTMLInputElement).click(); await tick(); check(document.querySelectorAll('[data-product-id]').length === 6, 'Consultar productos desactivados');
  await openProduct('masks'); check(button('Registrar consumo').disabled && button('Registrar merma').disabled, 'Agotado deshabilita salidas'); check(document.body.textContent?.includes('Aún no hay existencias'), 'Producto sin lotes'); await checkpoint('no-lots');
  await click('Registrar entrada'); check(!(dialog().querySelector('[name="number"]') as HTMLInputElement).required && !(dialog().querySelector('[name="expiryDate"]') as HTMLInputElement).required, 'Lote y caducidad opcionales'); await checkpoint('entry');
  await set('[name="quantity"]', '10', dialog()); holdNext = true; button('Registrar entrada', dialog()).click(); await waitFor(() => !!release); check(button('Registrando…', dialog()).disabled && button('Cancelar', dialog()).disabled, 'Movimiento pendiente deshabilita doble envío y cierre'); release!(); await waitFor(() => !dialog()); check(document.body.textContent?.includes('Quedan 10 caja'), 'Entrada sin lote con feedback');
  await home(); await openProduct('resin'); check(document.body.textContent?.includes('RX-001') && document.body.textContent?.includes('RX-002'), 'Detalle con múltiples lotes'); await checkpoint('multi-lots');
  await click('Registrar consumo'); check((dialog().querySelector('[name="lotId"]') as HTMLSelectElement).value === 'lot-near', 'Consumo sugiere FEFO'); await checkpoint('consumption');
  await set('[name="quantity"]', '2', dialog()); failNext = true; await click('Registrar consumo', dialog()); check(dialog().textContent?.includes('El inventario cambió'), 'Error visible conserva formulario');
  await click('Cancelar', dialog()); await click('Actualizar'); await click('Registrar consumo'); await set('[name="quantity"]', '2', dialog()); await click('Registrar consumo', dialog()); await waitFor(() => !dialog()); check(document.body.textContent?.includes('Consumo registrado. Quedan 9 jeringa'), 'Consumo con stock y feedback actualizados');
  await click('Registrar merma'); check((dialog().querySelector('[name="reason"]') as HTMLSelectElement).required, 'Merma exige motivo'); await checkpoint('waste'); await set('[name="quantity"]', '1', dialog()); await set('[name="reason"]', 'Contaminación', dialog()); await click('Registrar merma', dialog()); await waitFor(() => !dialog()); check(data.movements[0]?.type === 'WASTE' && data.movements[0]?.reason === 'Contaminación', 'Merma envía tipo y motivo');
  await click('Ajustar inventario +'); check((dialog().querySelector('[name="reason"]') as HTMLInputElement).required, 'Ajuste exige motivo'); await checkpoint('adjustment-in'); await set('[name="quantity"]', '1', dialog()); await set('[name="reason"]', 'Conteo físico', dialog()); await click('Registrar ajuste +', dialog()); await waitFor(() => !dialog()); check(data.movements[0]?.type === 'ADJUSTMENT_IN', 'Ajuste positivo');
  await click('Ajustar inventario −'); await checkpoint('adjustment-out'); await set('[name="quantity"]', '1', dialog()); await set('[name="reason"]', 'Corrección de conteo', dialog()); await click('Registrar ajuste -', dialog()); await waitFor(() => !dialog()); check(data.movements[0]?.type === 'ADJUSTMENT_OUT', 'Ajuste negativo');
  await home(); await openProduct('expired'); check(button('Registrar consumo').disabled && !button('Registrar merma').disabled && document.body.textContent?.includes('no están disponibles para consumo'), 'Caducado bloquea consumo, permite merma y explica existencia física'); await checkpoint('expired');
  await click('Editar producto'); await checkpoint('product'); await click('Cancelar', dialog());
  await home(); await click('Proveedores'); check(document.body.textContent?.includes('fixture@example.test'), 'Proveedor visible con contacto'); await checkpoint('suppliers'); await click('Nuevo proveedor'); await set('[name="name"]', 'Segundo proveedor', dialog()); await click('Guardar proveedor', dialog()); await waitFor(() => !dialog()); check(document.body.textContent?.includes('Proveedor guardado.'), 'Alta proveedor con feedback');
  await click('Editar proveedor'); (dialog().querySelector('[name="active"]') as HTMLInputElement).click(); await click('Guardar proveedor', dialog()); await waitFor(() => !dialog()); check(document.body.textContent?.includes('Inactivo'), 'Desactivar proveedor conserva ficha');
  await click('Productos'); (document.querySelector('main input[type="checkbox"]') as HTMLInputElement).click(); await tick(); await openProduct('inactive'); check(button('Registrar entrada').disabled, 'Producto inactivo deshabilita movimientos'); await checkpoint('inactive');
  for (const currentRole of ['PROFESSIONAL', 'ASSISTANT', 'OWNER']) {
    role = currentRole; render(); await waitFor(() => !!button('Productos')); const nav = [...document.querySelectorAll<HTMLAnchorElement>('nav a')].filter(a => a.textContent?.trim() === 'Inventario' && visible(a)); check(nav.length > 0, `Inventario visible en navegación para ${role}`); if (innerWidth < 768) { const rect = nav[0]!.getBoundingClientRect(); check(rect.top >= 0 && rect.bottom <= innerHeight + 1, `Navegación móvil dentro del viewport para ${role}`); } check(!!button('Nuevo producto') === (role === 'OWNER'), `Configuración restringida para ${role}`); await openProduct('articaine'); check(!button('Registrar consumo').disabled && !button('Registrar entrada').disabled, `Operación cotidiana habilitada para ${role}`); check(!!button('Ajustar inventario +') === (role === 'OWNER'), `Ajustes solo propietario: ${role}`);
  }
  await checkpoint('normal');
  check(requests.filter(r => r.body).every(r => !('clinicId' in r.body!) && !('userId' in r.body!)), 'Frontend no envía clínica ni actor');
  document.body.dataset.inventoryTests = 'passed';
}
run().catch(e => { results.push('FAIL ' + e.message); document.body.dataset.inventoryTests = 'failed'; }).finally(() => { document.getElementById('inventory-test-results')!.textContent = results.join('\n'); });
