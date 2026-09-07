import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Modal } from '../../src/shared/components/Modal/Modal';
import './styles.css';

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);
let open = false;
let nested = false;
let tall = false;
let busy = false;
const results: string[] = [];
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  results.push(message);
};
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
function render() {
  flushSync(() => root.render(
    <StrictMode>
      <main style={{ transform: 'translateZ(0)', marginLeft: '15%', paddingTop: 1000, height: 3000 }}>
        <button id="opener" onClick={() => { open = true; render(); }}>Abrir</button>
        {open && <Modal onClose={() => { open = false; render(); }} closeOnEscape={!busy}>
          <section id="panel" className="bg-white w-full max-w-md" style={{ height: tall ? 1400 : 220 }}>
            <h2>Prueba de modal</h2>
            <button id="first" onClick={() => { nested = true; render(); }}>Segundo modal</button>
            <button id="last">Último</button>
          </section>
        </Modal>}
        {nested && <Modal onClose={() => { nested = false; render(); }}><section className="bg-white p-4"><button id="child">Cerrar hijo</button></section></Modal>}
      </main>
    </StrictMode>,
  ));
}
function key(key: string, shiftKey = false) {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
}
async function run() {
  render();
  window.scrollTo(0, 850);
  const originalScroll = window.scrollY;
  const originalStyle = document.body.getAttribute('style') || '';
  const opener = document.getElementById('opener')!;
  opener.focus({ preventScroll: true });
  opener.click();
  await tick();
  const overlay = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const panel = document.getElementById('panel')!;
  const rect = panel.getBoundingClientRect();
  assert(overlay.parentElement === document.body, 'Portal directo a body');
  assert(getComputedStyle(overlay).position === 'fixed', 'Overlay fijo');
  assert(Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 2, 'Centrado horizontal desde layout transformado');
  assert(Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 2, 'Centrado vertical desde página scrolleada');
  assert(rootElement.inert && document.body.style.position === 'fixed', 'Fondo inerte y scroll bloqueado');
  assert(document.activeElement?.id === 'first', 'Foco inicial dentro');
  key('Tab', true);
  assert(document.activeElement?.id === 'last', 'Shift+Tab cicla al último');
  key('Tab');
  assert(document.activeElement?.id === 'first', 'Tab cicla al primero');
  document.getElementById('first')!.click();
  await tick();
  const layers = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
  assert(layers.length === 2 && layers[0].inert && !layers[1].inert, 'Sólo capa superior interactiva');
  assert(Number(layers[1].style.zIndex) > Number(layers[0].style.zIndex), 'Z-index consistente para diálogos superpuestos');
  key('Escape');
  assert(document.querySelectorAll('[role="dialog"]').length === 1, 'Escape cierra únicamente el superior');
  assert(document.body.style.position === 'fixed' && rootElement.inert, 'Cerrar hijo mantiene bloqueo');
  assert(document.activeElement?.id === 'first', 'Cerrar hijo restaura foco al padre');
  busy = true;
  render();
  key('Escape');
  assert(open && document.activeElement?.id === 'first', 'Callbacks nuevos no reinician foco; Escape respeta operación pendiente');
  busy = false;
  tall = true;
  render();
  await tick();
  assert(panel.getBoundingClientRect().top >= 0 && overlay.scrollHeight > overlay.clientHeight, 'Contenido alto comienza visible y desborda dentro del overlay');
  overlay.scrollTop = overlay.scrollHeight;
  assert(panel.getBoundingClientRect().bottom <= innerHeight, 'Extremo inferior accesible mediante scroll del overlay');
  key('Escape');
  assert(window.scrollY === originalScroll, 'Scroll original restaurado');
  assert(!rootElement.inert && document.activeElement === opener, 'Fondo y foco restaurados');
  assert((document.body.getAttribute('style') || '') === originalStyle, 'Estilos originales restaurados');
  tall = false;
  open = true;
  nested = true;
  render();
  open = false;
  render();
  assert(rootElement.inert && document.body.style.position === 'fixed', 'Desmontar padre antes del hijo conserva bloqueo');
  nested = false;
  render();
  assert(!rootElement.inert && window.scrollY === originalScroll, 'Desmontaje fuera de orden libera bloqueo final');
  document.body.dataset.modalTests = 'passed';
}
run().catch(error => {
  document.body.dataset.modalTests = 'failed';
  results.push(String(error));
}).finally(() => {
  const output = document.createElement('pre');
  output.id = 'modal-test-results';
  output.textContent = results.join('\n');
  document.body.append(output);
});
