import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/core/auth/AuthProvider';
import { MainLayout } from '../../src/shared/components/Layout/MainLayout';
import { AppointmentsPage } from '../../src/features/appointments/AppointmentsPage';
import { getClinicTime, getMonthDays, getMonthlyRanges, addMonthsCivil, getCivilDate, addDaysCivil, civilDateAndTimeToIso } from '../../src/features/appointments/utils/date';
import { AppointmentFormModal } from '../../src/features/appointments/components/AppointmentFormModal';
import { getNewAppointmentStart } from '../../src/features/appointments/utils/date';
import './styles.css';

const today = getCivilDate();
const future = addDaysCivil(today, 1);
const patient = { id: 'patient', firstName: 'Mariana', lastName: 'López', secondLastName: 'García', phone: '5551234567', email: 'mariana@example.test', status: 'ACTIVE' };
const professional = { id: 'professional', role: 'PROFESSIONAL', status: 'ACTIVE', user: { id: 'user', firstName: 'Andrea', lastName: 'Martínez', email: 'andrea@example.test' } };
const statuses = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const appointment = (id: number, day = today) => ({ id: `appointment-${id}`, patientId: patient.id, professionalMembershipId: professional.id, patient: { ...patient, firstName: ['Mariana', 'Diego', 'Lucía', 'Roberto', 'Valeria', 'Carlos'][id % 6] }, professionalMembership: professional, startAt: civilDateAndTimeToIso(day, `${String(9 + id % 8).padStart(2, '0')}:00`), endAt: civilDateAndTimeToIso(day, `${String(9 + id % 8).padStart(2, '0')}:45`), status: statuses[id % 6], reason: 'Revisión y limpieza dental', administrativeNotes: 'Paciente solicita confirmar por teléfono un día antes.', cancellationReason: 'Reprogramación solicitada por el paciente.' });
let data = Array.from({ length: 28 }, (_, id) => appointment(id, id < 6 ? today : addDaysCivil(today, (id % 20) - 10)));
let role = 'OWNER';
let failCreate = false;
let failList = false;
let failConfirm = false;
let failCancel = false;
let releaseCancel: (() => void) | undefined;
let releaseConfirm: (() => void) | undefined;
const requests: { path: string; body?: any; method?: string }[] = [];
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, body, method: init?.method });
  if (path.endsWith('/auth/me')) return Response.json({ user: professional.user, activeClinicId: 'clinic', activeRole: role, memberships: [{ id: role === 'PROFESSIONAL' ? 'other' : professional.id, clinicId: 'clinic', clinicName: 'YESKIRA Dental', role }] });
  if (path.includes('/patients?')) return Response.json({ items: [patient], total: 1 });
  if (path.endsWith('/appointments/professionals')) return Response.json([professional]);
  if (path.includes('/appointments?')) {
    if (failList) { failList = false; return Response.json({}, { status: 500 }); }
    const url = new URL(path, 'http://fixture');
    const start = url.searchParams.get('startAt')!; const end = url.searchParams.get('endAt')!;
    if ((Date.parse(end) - Date.parse(start)) / 86400000 > 35) throw new Error('API range exceeds 35 days');
    return Response.json(data.filter(a => a.startAt >= start && a.startAt < end));
  }
  if (path.endsWith('/appointments') && body) {
    if (failCreate) { failCreate = false; return Response.json({ error: { code: 'APPOINTMENT_CONFLICT' } }, { status: 409 }); }
    const item = { ...appointment(30, future), ...body, id: 'created' }; data.push(item); return Response.json(item);
  }
  if (path.endsWith('/cancel')) {
    await new Promise<void>(resolve => { releaseCancel = resolve; });
    if (failCancel) { failCancel = false; return Response.json({}, { status: 500 }); }
    const target = data.find(a => path.endsWith(`/appointments/${a.id}/cancel`))!;
    Object.assign(target, body, { status: 'CANCELLED' }); return Response.json(target);
  }
  if (path.endsWith('/status')) {
    await new Promise<void>(resolve => { releaseConfirm = resolve; });
    if (failConfirm) { failConfirm = false; return Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }); }
    const target = data.find(a => path.endsWith(`/appointments/${a.id}/status`))!;
    Object.assign(target, body); return Response.json(target);
  }
  const item = data.find(a => path.endsWith(`/appointments/${a.id}`));
  if (item) { if (body) Object.assign(item, body); return Response.json(item); }
  return Response.json({}, { status: 404 });
};
const root = createRoot(document.getElementById('root')!);
function render(path = '/appointments') { root.render(<AuthProvider key={`${role}:${path}`}><MemoryRouter initialEntries={[path]}><Routes><Route element={<MainLayout />}><Route path="/appointments" element={<AppointmentsPage />} /></Route></Routes></MemoryRouter></AuthProvider>); }
const results: string[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const check = (value: unknown, label: string) => { if (!value) throw new Error(label); results.push('PASS ' + label); };
const button = (text: string, scope: ParentNode = document) => [...(scope?.querySelectorAll<HTMLButtonElement>('button') || [])].find(b => b.textContent?.trim() === text && b.getClientRects().length)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
async function waitFor(fn: () => unknown) { for (let n = 0; n < 150; n++) { if (fn()) return; await tick(); } throw new Error('Timed out waiting for interface'); }
async function click(text: string, scope: ParentNode = document) { const b = button(text, scope); if (!b) throw new Error(`Missing button ${text}`); b.click(); await tick(); await tick(); }
async function set(selector: string, value: string, scope: ParentNode = document) { const el = scope.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!; if (!el) throw new Error(`Missing field ${selector}`); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); await tick(); }
async function checkpoint(name: string) { check(document.documentElement.scrollWidth <= innerWidth, `Sin overflow: ${name}`); if (new URLSearchParams(location.search).get('review') === name) { document.body.dataset.review = name; await new Promise(() => {}); } }
async function run() {
  check(getClinicTime('2026-09-10T19:00:00Z') === '13:00', 'Horario HH:mm válido para edición y calendario compacto');
  check(getMonthDays('2026-03-15').length === 42, 'Mes de seis semanas');
  check(getMonthDays('2027-02-15').length === 28, 'Mes de cuatro semanas');
  check(getMonthDays('2024-02-15').includes('2024-02-29'), 'Febrero bisiesto');
  check(addMonthsCivil('2026-01-31', 1) === '2026-02-28' && addMonthsCivil('2026-12-31', 1) === '2027-01-31', 'Navegación de mes y año');
  const ranges = getMonthlyRanges('2026-03-15');
  check(ranges.length === 2 && ranges[0].endAt === ranges[1].startAt && ranges.every(r => (Date.parse(r.endAt) - Date.parse(r.startAt)) / 86400000 <= 35), 'Rangos mensuales contiguos dentro del límite API');
  check(getCivilDate('2026-09-11T02:00:00Z') === '2026-09-10', 'Agrupación por zona de clínica');
  render(); await waitFor(() => !!button('Mes'));
  await click('Mes'); await waitFor(() => !!document.querySelector('[aria-label^="Ver día"]'));
  await checkpoint('month');
  await set('[aria-label="Filtrar por estado"]', 'CONFIRMED');
  check(!document.querySelector('button[title*="Programada"]') && !!document.querySelector('button[title*="Confirmada"]'), 'Filtro de estado en mes');
  await click('Limpiar filtros');
  const more = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(' más'))!;
  check(!!more, 'Día ocupado ofrece ver más'); more.click(); await waitFor(() => button('Día')?.getAttribute('aria-pressed') === 'true');
  await checkpoint('day');
  await click('Semana'); await waitFor(() => !!document.querySelector('button[aria-label*="cita"]'));
  check(button('Semana').getAttribute('aria-pressed') === 'true', 'Vista semanal conservada');
  await click('Mes'); await waitFor(() => !!document.querySelector('[aria-label^="Nueva cita el"]'));
  const create = document.querySelector<HTMLButtonElement>('[aria-label^="Nueva cita el"]')!; create.click(); await waitFor(() => !!dialog());
  check(!!dialog().querySelector<HTMLInputElement>('input[type="date"]')?.value, 'Crear desde día preselecciona fecha');
  await set('input[type="text"]', 'Mariana', dialog()); await waitFor(() => !!button('Mariana López García', dialog())); await click('Mariana López García', dialog());
  await set('input[type="date"]', future, dialog()); await set('select[id$="-start"]', '10:00', dialog()); await click('45 min', dialog());
  await set('section[aria-label="Profesional de la cita"] select', 'professional', dialog());
  check(dialog().textContent?.includes('45 min en total'), 'Duración rápida calcula término');
  await checkpoint('form');
  failCreate = true; await click('Guardar cita', dialog()); await waitFor(() => !!dialog()?.querySelector('[role="alert"]'));
  check(dialog().textContent?.includes('ya tiene una cita') && dialog().textContent?.includes('Mariana'), 'Conflicto conserva captura y muestra error');
  await click('Guardar cita', dialog()); await waitFor(() => !dialog());
  const payload = requests.find(r => r.body?.patientId)?.body;
  check(payload.patientId === 'patient' && payload.startAt === civilDateAndTimeToIso(future, '10:00') && payload.endAt === civilDateAndTimeToIso(future, '10:45') && !payload.clinicId, 'Alta usa contrato y horario clínico existentes');
  render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('Editar', dialog()));
  check(!!button('Iniciar atención', dialog()), 'Responsable conserva acción clínica');
  await checkpoint('detail');
  await click('Editar', dialog()); await waitFor(() => document.querySelectorAll('[role="dialog"]').length === 2);
  const edit = document.querySelectorAll<HTMLElement>('[role="dialog"]')[1];
  check(edit.textContent?.includes('Mariana López García') && !button('Cambiar', edit), 'Edición conserva paciente bloqueado');
  check(edit.querySelector<HTMLSelectElement>('select[id$="-start"]')?.value === '09:00', 'Edición precarga hora válida');
  await click('Cancelar', edit);
  role = 'PROFESSIONAL'; render('/appointments?appointment=appointment-1'); await waitFor(() => dialog()?.textContent?.includes('Diego'));
  check(!button('Editar', dialog()) && !button('Iniciar atención', dialog()) && !button('Cancelar cita', dialog()), 'Profesional ajeno no obtiene acciones');
  role = 'ASSISTANT'; render('/appointments?appointment=appointment-2'); await waitFor(() => dialog()?.textContent?.includes('Lucía'));
  check(!button('Iniciar atención', dialog()) && !button('Cancelar cita', dialog()), 'Asistente no inicia atención ni cancela cita en curso');
  role = 'OWNER'; render('/appointments?appointment=appointment-4'); await waitFor(() => dialog()?.textContent?.includes('Motivo de cancelación'));
  check(!button('Editar', dialog()) && !button('Cancelar cita', dialog()), 'Cancelada muestra motivo sin acciones inválidas');
  render('/appointments?new=1'); await waitFor(() => !!button('Guardar cita', dialog())); check(!!dialog(), 'Enlace de nueva cita conservado'); await click('Cancelar', dialog());
  failList = true; await click('Mes'); await waitFor(() => !!button('Reintentar')); await click('Reintentar'); await waitFor(() => !!document.querySelector('[aria-label^="Ver día"]')); check(true, 'Error de agenda permite reintento');
  document.body.dataset.appointmentTests = 'passed';
}
async function runFocused() {
  for (const [input, expected] of [['09:00', '09:00'], ['09:01', '09:15'], ['09:14', '09:15'], ['09:15', '09:15'], ['09:16', '09:30'], ['09:34', '09:45'], ['09:46', '10:00']]) {
    check(getNewAppointmentStart(undefined, undefined, new Date(civilDateAndTimeToIso(future, input))).time === expected, `Redondeo ${input} → ${expected}`);
  }
  const midnight = getNewAppointmentStart(undefined, undefined, new Date(civilDateAndTimeToIso(future, '23:46')));
  check(midnight.time === '00:00' && midnight.date === addDaysCivil(future, 1), 'Redondeo cruza medianoche');
  const selected = getNewAppointmentStart(future, '09:34');
  check(selected.date === future && selected.time === '09:34', 'Selección explícita no se redondea');
  root.render(<AuthProvider><MemoryRouter><AppointmentFormModal isOpen initialDate={future} initialTime="09:34" onClose={() => {}} onSuccess={() => {}} /></MemoryRouter></AuthProvider>);
  await waitFor(() => dialog()?.querySelector<HTMLSelectElement>('select[id$="-start"]')?.value === '09:34');
  check(dialog().querySelector<HTMLInputElement>('input[type="date"]')?.value === future, 'Formulario conserva fecha/hora explícitas');
  render('/appointments?new=1'); await tick(); await waitFor(() => !!button('Guardar cita', dialog()));
  await waitFor(() => !!dialog()?.querySelector<HTMLSelectElement>('select[id$="-start"]')?.value);
  const start = dialog().querySelector<HTMLSelectElement>('select[id$="-start"]')!;
  check(start.options.length === 96 && [...start.options].every(o => Number(o.value.slice(3)) % 15 === 0), 'Selector ofrece solamente 96 bloques de 15 minutos');
  check(start.value === getNewAppointmentStart().time, 'Nueva cita usa hora redondeada por defecto');
  await set('input[type="date"]', future, dialog());
  await set('select[id$="-start"]', '10:00', dialog()); await click('45 min', dialog());
  await set('select[id$="-start"]', '10:15', dialog());
  check(dialog().querySelector<HTMLSelectElement>('select[id$="-end"]')?.value === '11:00', 'Cambio de inicio mantiene duración actual');
  await set('input[type="text"]', 'Mariana', dialog()); await waitFor(() => !!button('Mariana López García', dialog())); await click('Mariana López García', dialog());
  await set('section[aria-label="Profesional de la cita"] select', 'professional', dialog());
  await checkpoint('form');
  await click('Guardar cita', dialog()); await waitFor(() => !dialog());
  const created = requests.find(r => r.body?.patientId)?.body;
  check(created.startAt === civilDateAndTimeToIso(future, '10:15') && created.endAt === civilDateAndTimeToIso(future, '11:00'), 'Alta guarda inicio y duración correctos');
  data[0].startAt = civilDateAndTimeToIso(future, '09:34').replace(':00.000Z', ':27.000Z');
  data[0].endAt = civilDateAndTimeToIso(future, '10:07').replace(':00.000Z', ':27.000Z');
  const originalStart = data[0].startAt; const originalEnd = data[0].endAt;
  render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('Editar', dialog()));
  await click('Editar', dialog()); await waitFor(() => document.querySelectorAll('[role="dialog"]').length === 2);
  const edit = document.querySelectorAll<HTMLElement>('[role="dialog"]')[1];
  check(edit.querySelector<HTMLSelectElement>('select[id$="-start"]')?.value === '09:34' && edit.querySelector<HTMLSelectElement>('select[id$="-end"]')?.value === '10:07', 'Edición conserva horas históricas fuera de bloque');
  await click('Guardar cambios', edit); await waitFor(() => document.querySelectorAll('[role="dialog"]').length === 1 && !!button('Confirmar', dialog()));
  const updated = requests.find(r => r.method === 'PATCH' && r.path.endsWith('/appointment-0'))?.body;
  check(updated.startAt === originalStart && updated.endAt === originalEnd, 'Guardar edición sin cambiar horario conserva timestamps exactos');
  failConfirm = true;
  const confirm = button('Confirmar', dialog()); confirm.click(); confirm.click(); await tick();
  check(document.querySelectorAll('[role="dialog"]').length === 1 && button('Confirmando...', dialog())?.disabled, 'Confirmación directa muestra loading sin segundo modal');
  check(requests.filter(r => r.path.endsWith('/status')).length === 1, 'Doble click envía una sola petición');
  releaseConfirm!(); await waitFor(() => !!dialog()?.querySelector('[role="alert"]'));
  check(dialog().textContent?.includes('No tienes permisos') && !!button('Confirmar', dialog()), 'Error de confirmación mantiene detalle y permite reintento');
  await click('Confirmar', dialog()); releaseConfirm!(); await waitFor(() => !!dialog()?.querySelector('[role="status"]'));
  check(dialog().textContent?.includes('Confirmada') && dialog().textContent?.includes('Cita confirmada.') && !button('Confirmar', dialog()), 'Éxito actualiza estado y muestra feedback');
  await checkpoint('detail');
  await click('No asistió', dialog()); check(document.querySelectorAll('[role="dialog"]').length === 1, 'Inasistencia directa');
  releaseConfirm!(); await waitFor(() => dialog()?.textContent?.includes('Inasistencia registrada.'));
  render('/appointments?appointment=appointment-1'); await waitFor(() => !!button('Cancelar cita', dialog()));
  await click('Cancelar cita', dialog()); check(document.querySelectorAll('[role="dialog"]').length === 2, 'Cancelación conserva diálogo');
  data[0].status = 'SCHEDULED';
  role = 'PROFESSIONAL'; render('/appointments?appointment=appointment-0'); await waitFor(() => dialog()?.textContent?.includes('Mariana') && !button('Editar', dialog()));
  check(!button('Confirmar', dialog()), 'Profesional ajeno no puede confirmar');
  role = 'ASSISTANT'; render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('Confirmar', dialog()));
  check(!button('Iniciar atención', dialog()), 'Asistente puede confirmar y conserva permisos clínicos');
  document.body.dataset.appointmentTests = 'passed';
}
async function runDetailActions() {
  render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('No asistió', dialog()));
  await checkpoint('detail-actions');
  await click('Cancelar cita', dialog());
  const cancellation = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Cancelar cita"]')!;
  await waitFor(() => !!cancellation());
  check(cancellation().textContent?.includes('Mariana López García') && cancellation().textContent?.includes('09:00'), 'Cancelación identifica paciente y horario');
  check(cancellation().textContent?.includes('(opcional)') && cancellation().querySelector('textarea')?.maxLength === 500, 'Motivo opcional conserva límite de 500');
  await checkpoint('cancel');
  await set('textarea', 'El paciente solicita reprogramar.', cancellation());
  failCancel = true;
  const cancel = button('Cancelar cita', cancellation()); cancel.click(); cancel.click(); await tick();
  check(requests.filter(r => r.path.endsWith('/cancel')).length === 1 && button('Cancelando...', cancellation())?.disabled && button('Volver', cancellation())?.disabled && cancellation().querySelector('textarea')?.disabled, 'Cancelación bloquea doble submit y desactiva acciones/campo');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!!cancellation(), 'Escape no cierra durante cancelación');
  releaseCancel!(); await waitFor(() => !!cancellation()?.querySelector('[role="alert"]'));
  check(cancellation().querySelector('textarea')?.value === 'El paciente solicita reprogramar.' && cancellation().textContent?.includes('No fue posible cancelar'), 'Error conserva motivo y modal con mensaje comprensible');
  await click('Cancelar cita', cancellation()); releaseCancel!();
  await waitFor(() => !cancellation() && dialog()?.textContent?.includes('Cancelada'));
  check(dialog().textContent?.includes('El paciente solicita reprogramar.') && !button('Cancelar cita', dialog()), 'Cancelación exitosa actualiza detalle y motivo');
  render('/appointments?appointment=appointment-1'); await waitFor(() => !!button('Cancelar cita', dialog()));
  await click('Cancelar cita', dialog());
  check(cancellation().querySelector('textarea')?.value === '', 'Otra cancelación abre sin contenido ni loading anteriores');
  await click('Cancelar cita', cancellation());
  check(requests.filter(r => r.path.endsWith('/cancel')).at(-1)?.body.cancellationReason === undefined, 'Se permite cancelar sin motivo');
  releaseCancel!(); await waitFor(() => !cancellation() && dialog()?.textContent?.includes('Cancelada'));
  data[0].status = 'SCHEDULED';
  render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('Confirmar', dialog()));
  for (const [label, pending, feedback, status] of [['Confirmar', 'Confirmando...', 'Cita confirmada.', 'CONFIRMED'], ['No asistió', 'Registrando...', 'Inasistencia registrada.', 'NO_SHOW']]) {
    failConfirm = true;
    const count = requests.filter(r => r.path.endsWith('/status')).length;
    const action = button(label, dialog()); action.click(); action.click(); await tick();
    check(document.querySelectorAll('[role="dialog"]').length === 1 && button(pending, dialog())?.disabled, `${label}: acción directa con loading`);
    check(requests.filter(r => r.path.endsWith('/status')).length === count + 1 && requests.at(-1)?.body.status === status, `${label}: doble clic envía una petición con estado correcto`);
    releaseConfirm!(); await waitFor(() => !!dialog()?.querySelector('[role="alert"]'));
    check(dialog().textContent?.includes('No tienes permisos') && !button(label, dialog())?.disabled, `${label}: error mantiene detalle y permite reintentar`);
    await click(label, dialog()); releaseConfirm!(); await waitFor(() => dialog()?.textContent?.includes(feedback));
    check(!button(label, dialog()) && data[0].status === status, `${label}: éxito actualiza estado y feedback`);
  }
  for (const status of ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) {
    data[0].status = status;
    for (const nextRole of ['OWNER', 'ASSISTANT', 'PROFESSIONAL']) {
      role = nextRole;
      render(`/appointments?appointment=appointment-0&case=${status}`); await tick();
      await waitFor(() => dialog()?.textContent?.includes('Mariana') && !dialog()?.querySelector('.animate-pulse'));
      const allowed = nextRole !== 'PROFESSIONAL' && ['SCHEDULED', 'CONFIRMED'].includes(status);
      check(!!button('No asistió', dialog()) === allowed && !!button('Cancelar cita', dialog()) === allowed && !!button('Confirmar', dialog()) === (allowed && status === 'SCHEDULED'), `Permisos ${nextRole}/${status} conservados`);
    }
  }
  document.body.dataset.appointmentTests = 'passed';
}
(new URLSearchParams(location.search).has('detailActions') ? runDetailActions() : new URLSearchParams(location.search).has('focused') ? runFocused() : run()).catch(e => { results.push('FAIL ' + e.message); document.body.dataset.appointmentTests = 'failed'; }).finally(() => { document.getElementById('appointment-test-results')!.textContent = results.join('\n'); });
