# Revisión UX de plan, presupuestos y cobranza

Rama: `feature/treatment-plan-ux`, creada desde `origin/main` actualizado (`1c04ade`). Sin deploy, merge, push ni acceso a PROD/STAGING. Sin dependencias, migraciones o infraestructura nuevas.

## Auditoría previa

Se leyeron TreatmentPlanSection, TreatmentEditor, BudgetPayments, budgetPrint, ProcedureCatalog, PatientDetail, Modal, presentación del módulo, estilos globales, pruebas de navegador y contratos/servicio backend.

- Las casillas financieras estaban dentro de la lista clínica. El formulario de presupuesto permanecía visible incluso sin selección.
- Cuatro totales financieros precedían la lista clínica y competían con la tarea principal.
- El descuento era un monto fijo MXN; no existía porcentaje ni edición posterior en UI/API.
- Guardar presupuesto ya persistía sin imprimir. La duplicación encontrada era entre Imprimir y Guardar como PDF: ambos abrían el mismo documento.
- Acciones clínicas, catálogo y cancelación de pago parecían texto; faltaban estilos uniformes de foco, active, disabled y tamaño táctil.
- El estado del presupuesto se mostraba como texto, sin explicación de edición; pagos e historial tenían un único CTA ambiguo.
- El modal compartido ya resuelve portal, scroll, foco, Escape, fondo inerte y restauración del foco. Se conservó.
- PatientDetail conserva sus secciones e integración odontograma/pieza dental; no se rediseña la aplicación.

## Decisiones e implementación

1. Navegación interna entre plan clínico y presupuestos; cobranza es un bloque contextual de cada presupuesto guardado.
2. Resumen monetario del plan plegable. Lista clínica con pieza, procedimiento, precio, estado y edición; sin casillas para cotizar.
3. BudgetEditor separado: seleccionar tratamientos, descuento explícito, subtotal/descuento/total y guardar. Total destacado; máximo de 100 tratamientos conservado.
4. Monto fijo en MXN editable, validación de dos decimales y límites, cálculo en centavos y acción Quitar descuento. No se agregó porcentaje.
5. Guardar mantiene la edición y confirma éxito. Imprimir presupuesto consulta el documento guardado por GET; no escribe ni cambia estado. PDF permanece en el diálogo de impresión del documento.
6. Ver presupuesto despliega el detalle; Editar presupuesto abre el descuento; Imprimir presupuesto abre el documento. Aceptados/rechazados explican el bloqueo.
7. Primarios azules, secundarios con borde, destructivos rojos; hover, active, focus-visible, cursor y mínimo de 44 px en botones del módulo. Iconos en agregar e imprimir.
8. Cobranza separada del editor con Total/Pagado/Saldo, Registrar abono e historial plegable. Feedback de éxito y error de sobreabono con saldo explícito.

## Cambio backend necesario

El PATCH existente solo admitía transiciones de estado. Se extendió con una alternativa estricta `{discount, expectedVersion}`. Conserva compatibilidad con `{status, expectedVersion}` y no permite combinar ambas operaciones.

La corrección se permite únicamente en DRAFT/PRESENTED, sin cambiar partidas, precios, folio, identidad o estado. Se recalcula total desde el subtotal guardado. Se conservan control de acceso, paciente activo, transacción serializable, versión optimista y auditoría con valores antes/después. ACCEPTED/REJECTED permanecen bloqueados.

## Validación y evidencia

- Frontend: build aprobado; lint sin errores, nueve warnings en archivos fuera del cambio; aviso de bundle >500 kB.
- `npm run test:treatments`: aprobado en 1280×800 y 500×400. Conserva pruebas existentes y agrega separación clínica, descuento, quitar, corrección, total, guardar sin imprimir, impresión sin escrituras, bloqueo explicado, foco/Escape y overflow por vista.
- `npm run test:modals`: aprobado en ambos tamaños, incluido ciclo Tab/Shift+Tab, restauración de foco, scroll y capas.
- Backend `npm test`: 1,342 aprobados, cero fallos, dos omitidos por falta de configuración de BD de integración. No se conectó una BD de producción o staging.
- Backend typecheck/build aprobados.
- `git diff --check` aprobado; revisión de archivos y secretos sin hallazgos. No cambios de manifests/lockfiles, Docker, infraestructura o variables de entorno.

Caso real simulado en Chrome con fetch local: crear tratamiento → presupuesto con descuento → guardar → reabrir → corregir descuento (23.40 a 3.40) → guardar el mismo presupuesto → imprimir y comprobar total 120.05 sin escrituras. La prueba continúa con transiciones a presentado/aceptado y cobranza; restablece 23.40 para conservar las aserciones históricas de abonos (40.05, saldo 60.00), cancelación y pago total. El backend comprueba además corrección en presentado, quitar descuento, límites, auditoría y rechazo de versiones obsoletas.

Revisión visual real mediante Chrome headless y capturas inspeccionadas, usando componentes reales con datos simulados: nueve vistas en escritorio 1280×1000 y emulación exacta 390×844 (18 capturas). No equivale a una sesión con datos reales ni a una prueba en dispositivo físico.

Capturas reproducibles con `node tests/treatment-plans/ux-review.mjs` desde frontend. Salida: `/tmp/yeskira-treatment-ux-review/*-viewport.png`.

| Vista | Revisión |
|---|---|
| empty | Plan vacío y CTA clínico visible |
| plan | Tratamiento con pieza, precio, estado y edición |
| treatment | Formulario clínico con labels y foco visible |
| create | Selección propia; guardar deshabilitado sin tratamientos |
| discount | Monto explícito, quitar descuento y total destacado |
| edit | Presupuesto guardado, descuento editable y confirmación |
| accepted | Estado, bloqueo explicado, impresión y bloque de cobranza |
| partial | Confirmación de abono, saldo y captura separada |
| paid | Saldo cero, sin captura de abono, historial y cancelación |

Móvil: acciones envuelven en varias filas; formularios en una columna; modales largos desplazan verticalmente. Sin overflow horizontal en checkpoints. La revisión por captura inicial con window-size recortaba móvil; se reemplazó por Emulation.setDeviceMetricsOverride y capturas con sufijo `-viewport`.

## Archivos

- Frontend módulo: TreatmentPlanSection.tsx, TreatmentEditor.tsx, BudgetEditor.tsx (nuevo), BudgetPayments.tsx, ProcedureCatalog.tsx, presentation.ts, api.ts, budgetPrint.ts.
- Frontend pruebas: tests/treatment-plans/viewport.tsx, ux-review.mjs (nuevo).
- Backend: TreatmentSchema.ts, TreatmentService.ts y TreatmentService.test.ts dentro de modules/treatment-plans.
- Documentación: este archivo.

## Límites y siguientes mejoras

La edición del descuento requiere la ampliación compatible del backend incluida en esta rama; no funciona contra la API anterior. No se desplegó.

Futuro: repetir el flujo con personal de clínica y dispositivo físico; ejecutar integración/concurrencia contra BD desechable; evaluar búsqueda de tratamientos para planes extensos y confirmación de salida con cambios sin guardar. Los warnings ajenos al módulo quedan fuera de alcance.
