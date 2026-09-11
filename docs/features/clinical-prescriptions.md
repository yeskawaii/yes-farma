# Recetas odontológicas ordinarias

Rama: `feature/clinical-prescriptions`.

El expediente tiene una pestaña **Recetas**. Las consultas muestran la misma sección filtrada por consulta; crear desde allí asigna `encounterId`. Desde el paciente la relación es opcional. La captura no sugiere medicamentos ni dosis.

## Datos y permisos

`Prescription` y `PrescriptionItem` guardan medicamentos estructurados. `ProfessionalProfile` incorpora domicilio profesional, teléfono y cédula de especialidad; reutiliza cédula y especialidad existentes. **Mis datos profesionales** actualiza el perfil de la membresía de la clínica activa; no reactiva perfiles deshabilitados. Nombre y apellidos provienen de `User`.

OWNER y PROFESSIONAL activos pueden consultar recetas de su clínica. Solo el prescriptor original puede editar su borrador, emitir o anular. Emitir exige perfil activo, cédula, domicilio profesional, paciente activo con fecha de nacimiento y todos los campos esenciales de cada medicamento. ASSISTANT no accede al contenido ni imprime, siguiendo la restricción del detalle clínico existente.

La sesión/membresía determina la clínica. Las claves foráneas compuestas refuerzan paciente, prescriptor, consulta y usuario anulador dentro de la misma clínica. La consulta debe corresponder también al mismo paciente.

## Emisión y documentos

- DRAFT: editable, sin folio ni snapshot. Se permite captura incompleta.
- ISSUED: folio global `RX-` + UUID completo sin guiones, con índice único PostgreSQL. No es folio oficial. Fecha, snapshot y auditoría se escriben en una transacción serializable.
- CANCELLED: conserva folio y documento; agrega motivo, actor y fecha. Sin eliminación ni edición posterior.

El snapshot JSON guarda nombre/zona horaria de clínica, identificación y nacimiento del paciente, datos profesionales, medicamentos, instrucciones, fecha y folio. El documento se renderiza exclusivamente desde ese snapshot, con el estado de anulación actual superpuesto. Las fechas civiles no se desplazan por UTC. Control optimista `expectedVersion` y hasta tres intentos de transacción resuelven conflictos; una revisión obsoleta recibe 409.

Se reutiliza el patrón técnico de presupuestos: HTML escapado, ventana de impresión y **Guardar como PDF** del navegador. Carta, firma física, medicamentos sin cortes de bloque cuando caben, folio en encabezado y cierre del documento y marca de anulación en todas las páginas. No hay motor PDF en servidor ni firma digital. Las descargas antiguas no pueden revocarse remotamente.

## API

Prefijo `/api/prescriptions`, sesión y protección de origen existentes, respuestas `private, no-store`:

- `GET /profile`, `PATCH /profile`
- `GET /patients/:patientId`, `POST /patients/:patientId`
- `GET /patients/:patientId/:id`, `PATCH /patients/:patientId/:id`
- `POST /patients/:patientId/:id/issue` (`expectedVersion`)
- `POST /patients/:patientId/:id/cancel` (`expectedVersion`, `reason`)

Creación, cambios de borrador, emisión con folio, anulación y actualización de perfil reutilizan `AuditEvent`. Las mutaciones y sus auditorías son atómicas. La consulta/reimpresión es una lectura y no genera otro registro.

## Migración y verificación

Migración aditiva: `20260911120000_clinical_prescriptions`. Debe aplicarse mediante el proceso habitual antes de habilitar esta versión. No se aplica a producción como parte de este trabajo.

Backend:

```sh
npm run typecheck
npm run build
npm test
# Base desechable local exclusivamente; el test verifica nombre y puerto.
PRESCRIPTION_TEST_DATABASE_URL=postgresql://postgres:prescription_test@127.0.0.1:55439/prescriptions_test npx tsx --test --import ./src/test-setup.ts src/modules/prescriptions/Prescription.test.ts
```

Frontend:

```sh
npm run build
npm run test:prescriptions
# Desde la raíz, generar fixtures ficticios:
./backend/node_modules/.bin/tsx frontend/tests/prescriptions/print-fixtures.ts
# Desde frontend, con Chrome local:
node tests/prescriptions/print-review.mjs
swift -module-cache-path /tmp/yeskira-swift-cache tests/prescriptions/verify-pdfs.swift
```

Sin la variable de integración, la suite general omite el test PostgreSQL; hay que ejecutarlo explícitamente para cubrir concurrencia, restricciones reales, auditoría atómica y endpoints autenticados. El test de navegador usa API simulada para interacción y viewport; los tests HTTP sí usan sesiones y PostgreSQL reales.

Límites deliberados: 30 medicamentos por receta; doble copia pendiente; sin recetario especial, firma electrónica, catálogo farmacológico, inventario, dispensación, IA ni comunicaciones externas.

## Resultado de validación de esta implementación

- Migraciones completas aplicadas desde cero a PostgreSQL 16 desechable.
- Suite backend: 1,385 pruebas aprobadas, 0 fallos y 6 omitidas.
- Integración específica de recetas con PostgreSQL: 14 aprobadas, sin omisiones.
- Interfaz: 16 comprobaciones aprobadas en cada viewport (1280×800 y 500×400).
- Typecheck y builds de backend/frontend aprobados. Lint sin errores; advertencias existentes fuera de recetas. Vite conserva la advertencia de tamaño del bundle.
- El adaptador PostgreSQL emite una advertencia de deprecación durante las pruebas; no afecta sus resultados.
- Seis PDFs reales verificados con Chrome y PDFKit: 1, 3 y 30 medicamentos, tanto emitidos como anulados. Carta en todas las páginas, sin controles web ni páginas vacías, todos los medicamentos presentes, firma y folio conservados. Las recetas cortas ocupan una página; las largas paginan. Marca de anulación en cada página.
