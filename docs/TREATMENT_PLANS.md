# Planes de tratamiento y presupuestos — MVP

Implementado el 7 de septiembre de 2026. Código para revisión; no se aplicó a la base actual ni se desplegó.

## Auditoría y reutilización

- Backend Express 5/TypeScript organizado en dominio, aplicación e infraestructura. Se conserva Prisma 7 con adapter PostgreSQL, Zod, AppError, AuditEvent y transacciones.
- Tenencia: Clinic → Membership → User. Se reutilizan cookies de sesión, authMiddleware y validateOrigin. Los nuevos middleware solo se aplican a las nuevas rutas.
- Pacientes: se usa Patient existente; pacientes inactivos permiten lectura, no escritura clínica.
- Odontograma: se reutilizan ToothSurface, las 32 piezas FDI permanentes y las reglas anterior/incisal y posterior/oclusal. Hallazgos y evaluaciones no cambian.
- Citas/expediente: ya existen ClinicalProcedure ligados a consultas; representan procedimientos documentados en la consulta, sin planificación ni precios. Los nuevos tratamientos tienen otro ciclo de vida; no se duplican ni se sincronizan automáticamente hallazgos o procedimientos clínicos.
- Permisos: OWNER y PROFESSIONAL con ProfessionalProfile activo, igual que el odontograma. ASSISTANT no accede al módulo clínico. El profesional responsable es una Membership activa de la misma clínica con perfil profesional activo.
- Frontend: React/Vite/Tailwind; reutiliza apiClient, pestañas del paciente, Modal con gestión de foco y ProfessionalSelector. No se agregaron dependencias.
- Migraciones: SQL versionado con Prisma. Se generó el diferencial entre schemas sin conectar a la base existente y se revisó antes de aplicarlo únicamente a una base temporal.

## Funcionalidad

La pestaña **Plan de tratamiento** permite crear y editar tratamientos, cambiar sus estados, consultar piezas/superficies, fechas, responsable, descripción, observaciones y totales. La cancelación conserva el registro; no existe borrado físico.

El catálogo permite altas, edición y activación/desactivación. Se configura por clínica desde la UI; no contiene precios ni tratamientos precargados. Se permite un procedimiento personalizado. El nombre y el precio del tratamiento se conservan aunque cambie el catálogo.

El odontograma del expediente muestra una insignia **T** para piezas con tratamientos no cancelados. El detalle de una pieza abre la creación del tratamiento con esa pieza seleccionada. Un tratamiento permite volver al detalle de su pieza. Los contextos del odontograma en consultas mantienen su comportamiento anterior.

Los presupuestos guardan conceptos seleccionados, pieza/superficies, descripción y precio como una copia inmutable, además de subtotal, descuento fijo y total. Los conceptos se consultan desplegando el presupuesto. Los estados siguen BORRADOR → PRESENTADO → ACEPTADO o RECHAZADO. Para corregir conceptos se genera otro presupuesto. Aceptar un presupuesto no cambia automáticamente estados clínicos.

## Dinero, estados y concurrencia

- Moneda del MVP: MXN. Importes de API como cadenas decimales, sin notación exponencial, no negativos y hasta dos decimales. Cálculos del servidor en centavos enteros; almacenamiento PostgreSQL Decimal.
- Máximo individual: 9,999,999,999.99. Máximo 100 conceptos por presupuesto. Descuento entre cero y subtotal; total calculado únicamente en el servidor.
- Estados de tratamiento en API/DB: PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED. Traducciones en español en UI. Se permiten correcciones entre estados conservando auditoría; completedAt solo corresponde a COMPLETED y es opcional.
- Totales: planeado = todos salvo cancelados; aceptado = aceptados + en proceso + realizados; realizado = realizados; pendiente = pendientes + aceptados + en proceso. No representan saldos por cobrar.
- PATCH requiere expectedVersion. Versiones obsoletas o conflictos de transacciones devuelven 409; las actualizaciones incrementan version.
- Las mutaciones y su auditoría se guardan en la misma transacción Serializable. Relaciones compuestas impiden mezclar clínicas y, en los conceptos del presupuesto, pacientes.

## API

Todas las rutas llevan prefijo `/api`, sesión y autorización clínica.

| Método | Ruta | Resultado |
|---|---|---|
| GET | /dental-procedures | Catálogo de la clínica, incluidos inactivos |
| POST | /dental-procedures | Crear procedimiento |
| PATCH | /dental-procedures/:id | Editar/desactivar procedimiento |
| GET | /patients/:patientId/treatment-plan | Tratamientos, totales y presupuestos con conceptos |
| POST | /patients/:patientId/treatments | Crear tratamiento |
| PATCH | /patients/:patientId/treatments/:id | Editar tratamiento o cambiar estado |
| POST | /patients/:patientId/budgets | Crear presupuesto con treatmentIds y discount |
| PATCH | /patients/:patientId/budgets/:id | Cambiar estado con status y expectedVersion |

Los PATCH de catálogo/tratamiento envían el formulario completo y expectedVersion. Los IDs de paciente/clínica se obtienen de ruta y sesión, no del body. Campos desconocidos, referencias inválidas y estados fuera del enum se rechazan.

## Migración y compatibilidad

`20260907180000_add_treatment_plans_and_budgets` agrega DentalProcedure, PatientTreatment, TreatmentBudget, TreatmentBudgetItem y dos enums. Solo crea tablas, índices, claves foráneas y CHECK sobre tablas nuevas. No cambia columnas existentes, no elimina datos y no precarga procedimientos.

Prisma no proporciona migraciones down automáticas. La reversión de aplicación puede conservar estas tablas aditivas; no se incluye un down que destruya registros. Al liberar, la migración debe preceder al backend nuevo y debe regenerarse Prisma Client según el flujo existente. No se ejecutó migrate deploy, migrate dev ni migrate reset contra la base actual.

## Validación

- Backend: `npm run test`: 1,325 aprobados, 0 fallos y 1 prueba de persistencia omitida por defecto (ejecutada aparte y aprobada). `npm run typecheck` y `npm run build`: aprobados.
- Frontend: `npm run build`, `npm run lint`, `npm run test:modals`, `npm run test:treatments`.
- Prisma: `prisma validate`; cadena completa de 10 migraciones aplicada a PostgreSQL embebido temporal (PGlite disponible en el entorno), conservando un registro creado antes de la nueva migración.
- La prueba `TreatmentPersistence.test.ts` es optativa en la suite normal. Para ejecutarla, proporcionar `TREATMENT_TEST_DATABASE_URL` de una base de pruebas desechable con migraciones aplicadas y ejecutar la suite o ese archivo. Nunca usa DATABASE_URL como fallback. Crea fixtures únicos en una transacción que se revierte.
- La prueba de persistencia se ejecutó aparte contra la base temporal con Prisma/adapter-pg reales: catálogo, tratamiento, presupuesto, copia de precios, totales, auditoría y asociación de conceptos. Aprobada.
- Pruebas de navegador con API simulada, Chrome headless a 1280×800 y 500×400: pieza preseleccionada, precio del catálogo, guardado, descuento, presupuesto presentado, vista de lectura y desbordamiento horizontal. No sustituyen una prueba con sesión clínica real en staging.
- Lint sin errores; conserva nueve advertencias en archivos preexistentes. Vite advierte que el bundle principal supera 500 kB.

## Siguiente iteración

PDF/impresión del presupuesto, revisiones de presupuestos, listado de auditoría para usuarios, paginación para expedientes grandes e integración explícita con consulta clínica. Pagos, saldos e impuestos quedan fuera de este MVP. Antes de liberar se recomienda revisar visualmente con usuarios clínicos y probar sobre una copia representativa de la base de producción.
