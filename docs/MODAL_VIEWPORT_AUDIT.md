# Auditoría de modales: viewport

Trabajo exclusivamente local de infraestructura UI. Sin cambios en lógica clínica ni contratos API.

## Causa y solución

`MainLayout` usa `animate-slide-up`, cuya animación conserva un `transform` mediante `forwards`. Los overlays `fixed` descendientes podían quedar referidos a ese layout en lugar del viewport.

`frontend/src/shared/components/Modal/Modal.tsx` es la única base bloqueante del frontend:

- Portal directo a `document.body`, overlay `fixed inset-0`, centrado con flex y altura mínima igual al overlay.
- Si el contenido excede la altura disponible, crece desde el margen superior y el overlay hace scroll; los paneles que ya tienen scroll interno lo conservan.
- Capas desde z-index 1000, por encima de navegación (40–50) y menú de captura (90).
- Una pila mantiene bloqueado el body hasta cerrar el último modal; restaura estilos y coordenadas originales incluso al desmontar fuera de orden.
- El fondo y las capas inferiores quedan `inert`; también se contemplan nuevos elementos añadidos al body.
- Foco inicial, contención de Tab/Shift+Tab, recuperación de foco y Escape exclusivamente en el modal superior. Se respetan las restricciones de cierre durante operaciones pendientes y las políticas de backdrop existentes.
- Nombre accesible explícito o derivado del encabezado; `role="dialog"` y `aria-modal` centralizados.

## Inventario completo

Rutas relativas a `frontend/src/features/`:

| Componente | Aperturas | Resultado |
| --- | ---: | --- |
| appointments/components/AppointmentDetailModal.tsx | 1 | Migrado; admite edición y confirmaciones superpuestas |
| appointments/components/AppointmentFormModal.tsx | 1 | Migrado; creación y edición |
| appointments/components/CancelAppointmentDialog.tsx | 1 | Migrado |
| appointments/components/StatusConfirmationDialog.tsx | 1 | Migrado |
| odontogram/components/ToothDetailModal.tsx | 1 | Migrado; incluye FDI 16 y las demás piezas |
| odontogram/components/ExitFastCaptureDialog.tsx | 1 | Portal y efectos duplicados sustituidos por la base; conserva foco inicial en continuar |
| patients/PatientCreate.tsx | 1 | Confirmación de posible duplicado migrada |
| clinical-encounters/EncounterEditor.tsx | 1 | Confirmación de finalización migrada |
| patient-documents/components/DocumentPreviewModal.tsx | 1 | Ya usaba la base; hereda corrección |
| patient-documents/components/UploadDocumentModal.tsx | 1 | Ya usaba la base; hereda corrección |
| patient-documents/components/PatientDocumentList.tsx | 1 | Confirmación de eliminación ya usaba la base |
| patients/PatientDetail.tsx | 2 | Desactivación/reactivación ya usaban la base |

Total: 13 aperturas en 12 consumidores. `records/RecordsPage.tsx` no contiene un overlay bloqueante propio.

## Excepciones justificadas

- `FastCaptureDock`: barra de trabajo no bloqueante; se interactúa con el odontograma mientras permanece abierta. Su portal es un `role="menu"` de acciones, no un modal.
- `PatientSelector`: dropdown no bloqueante; los selects nativos y demás ayudas de navegación tampoco son modales.
- `BottomNav`: navegación fija, no overlay bloqueante.
- Tres llamadas `alert()` en documentos (errores de descarga/eliminación): diálogos nativos controlados por el navegador, independientes del layout y su scroll. No son implementaciones DOM que puedan migrarse mediante un cambio de posicionamiento; se conserva su comportamiento.
- La vista PDF mantiene su iframe. Los eventos de teclado dentro de un documento embebido pertenecen a ese documento; no se promete capturar Escape dentro de un visor PDF externo.

## Verificación reproducible

Desde `frontend/`:

```sh
npm run build
npm run lint
npm run test:modals
```

La prueba de regresión compila una fixture aislada con el Modal real y los estilos del frontend. Ejecuta Chrome headless con un perfil temporal, sin backend ni datos clínicos, en ventanas de 1280×800 y 500×400. Comprueba portal, centrado con scroll y ancestro transformado, contenido alto accesible, bloqueo de fondo, ciclos de foco, restricciones de Escape, capas superpuestas, callbacks actualizados y restauración tras cierres normales y fuera de orden. `MODAL_TEST_BROWSER` permite indicar otra ruta a un ejecutable Chromium. No instala dependencias ni modifica el perfil habitual del navegador.

Build pasa con aviso de tamaño de bundle; lint pasa con nueve advertencias preexistentes en código sin cambios funcionales. Estas pruebas cubren la infraestructura compartida; no sustituyen una prueba clínica de cada formulario ni una verificación en dispositivos físicos/iOS.

Búsqueda global final, desde la raíz del repositorio:

```sh
rg -n '<Modal' frontend/src
rg -n 'createPortal|aria-modal|role="dialog"|role="alertdialog"|<dialog|fixed inset-0' frontend/src
rg -n 'fixed|absolute|backdrop|alert\(|confirm\(|prompt\(' frontend/src
rg --files frontend/src -g '*Modal*' -g '*Dialog*' -g '*Popup*' -g '*modal*' -g '*dialog*' -g '*popup*'
```

Resultado: `fixed inset-0`, `role="dialog"` y `aria-modal` sólo aparecen en la base compartida. El único portal adicional es el menú no bloqueante de `FastCaptureDock`. No quedan overlays modales manuales dependientes del contenedor.
