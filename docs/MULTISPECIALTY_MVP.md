# YESKIRA: Odontología y Pediatría

Implementación local del 12 de septiembre de 2026. No se realizaron operaciones Git, despliegues de aplicaciones ni cambios en producción. Las migraciones y pruebas con datos reales se ejecutaron exclusivamente sobre PostgreSQL desechable en `127.0.0.1:55439/prescriptions_test`.

## Arquitectura y especialidad activa

`Clinic.clinicalSpecialty` acepta únicamente `DENTISTRY` y `PEDIATRICS`. Su valor predeterminado es `DENTISTRY`, también para las clínicas anteriores a la migración.

La política central está en `backend/src/modules/clinic-configuration/capabilities.ts`. Ambas especialidades conservan pacientes, agenda, consultas, documentos, recetas, tratamientos, presupuestos, pagos e inventario. Solo Odontología habilita `odontogram` y `dentalClinicalTools`.

`GET /api/auth/me` entrega especialidad y capacidades en cada membresía, además de las opciones de configuración. `useClinicCapabilities()` obtiene las capacidades de la membresía correspondiente a `activeClinicId`. No infiere módulos desde `ProfessionalProfile.specialtyCode`. La respuesta de sesión utiliza `Cache-Control: private, no-store`.

Los roles OWNER, PROFESSIONAL y ASSISTANT mantienen las reglas existentes. Un asistente recibe el entorno de su clínica sin necesitar perfil profesional; eso no le concede permisos clínicos de profesional.

En Configuración (`/settings`):

- OWNER puede cambiar la especialidad principal de la clínica.
- Todos los miembros pueden ver esa configuración.
- Los usuarios con varias membresías activas pueden cambiar de clínica.
- El cambio recarga la aplicación y vuelve a solicitar la sesión, descartando el estado anterior de pacientes, consultas y modales.

No se duplicaron modelos ni módulos. Se conservan los nombres internos históricos `DentalProcedure`, `/dental-procedures` y `DentalCareService`; sus flujos genéricos sirven para ambas especialidades.

## Prisma y migración

Migración: `backend/prisma/migrations/20260912000000_clinic_specialty/migration.sql`.

- Enum `ClinicalSpecialty`: DENTISTRY, PEDIATRICS.
- `Clinic.clinicalSpecialty`: obligatorio, default DENTISTRY; PostgreSQL aplica el valor a filas existentes.
- En el mismo `Patient`: `guardianName`, `guardianPhone`, `guardianRelationship`, opcionales y acotados a 200, 50 y 100 caracteres.
- `ClinicalVitalSigns.heightCm` cambia de entero a `Float` / DOUBLE PRECISION para conservar tallas fraccionarias, manteniendo los enteros existentes.
- Cliente Prisma regenerado.

Una prueba aplica el SQL nuevo a tablas con datos anteriores, dentro de un esquema transaccional desechable: verifica la especialidad dental automática, la conservación de Patient y la talla previa.

La base habitual de desarrollo no fue migrada. Para usar esta versión en ella, primero debe aplicarse la migración correspondiente; la validación realizada aquí fue sobre una base aislada.

## Consulta pediátrica y paciente

Se reutilizan `ClinicalEncounter` y `ClinicalVitalSigns`. Los campos solicitados ya existían: no se creó otro expediente ni otra tabla de mediciones.

La consulta conserva motivo, antecedentes relevantes, alergias, medicamentos actuales, exploración, diagnósticos/impresión clínica, indicaciones y notas. Continúan el borrador, versionado, finalización y enmiendas existentes.

Las mediciones opcionales son peso (kg), talla (cm), temperatura (°C), frecuencia cardiaca (lpm), frecuencia respiratoria (rpm) y saturación (%). También se conservan las presiones arteriales previas. Las mediciones se relacionan por `clinicId` y `encounterId`, con `measuredAt`; la consulta identifica al paciente y tiene `occurredAt`. La UI y el backend aceptan talla decimal.

Patient conserva nacimiento, sexo y contacto. Los tres campos nuevos de responsable se capturan y editan en el formulario existente y se muestran en el expediente, utilizando el servicio, validación y auditoría existentes.

## UI, recetas y módulos compartidos

Se separaron los permisos de acceso clínico de la capacidad de odontograma: recetas y tratamientos ya no dependen de una variable llamada `canViewOdontogram`.

En Pediatría:

- No se muestra la pestaña de odontograma ni se monta el odontograma de la consulta.
- Tratamientos no muestran selectores de pieza ni superficies.
- Planes, presupuestos y su impresión omiten la presentación dental por pieza.
- Se conservan consultas, recetas, documentos, servicios y finanzas según los permisos existentes.

El perfil profesional permite seleccionar Odontología o Pediatría; conserva valores históricos de perfiles existentes. La impresión de recetas traduce PEDIATRICS a «Pediatría» y mantiene las etiquetas odontológicas previas. El pie compartido ahora dice YESKIRA.

Se reutiliza íntegramente Prescription: borradores, medicamentos estructurados, folio, emisión, snapshot, inmutabilidad, anulación, impresión/PDF y auditoría. No se modificó el cálculo de dosis porque no existe cálculo automático: la dosis sigue siendo captura manual del profesional.

## Protección del backend

- La autenticación comprueba sesión, usuario activo, membresía activa y clínica activa.
- `requireClinicCapability('odontogram')` consulta la clínica de la sesión y bloquea todas las rutas de odontograma, incluidas lecturas, con 403 en Pediatría.
- El servicio de odontograma filtra adicionalmente las membresías por capacidad de su clínica dentro de su transacción. También impide acceso si se llama directamente al servicio.
- Tratamientos verifican la capacidad dental dentro de la transacción al crear, cambiar o eliminar asociaciones por pieza/superficie.
- Los tratamientos dentales históricos conservan sus asociaciones al cambiar de especialidad. Se pueden editar sus datos genéricos manteniendo esas asociaciones; Pediatría no puede alterarlas.
- La configuración administrativa toma `clinicId` de sesión y comprueba nuevamente la membresía OWNER real. Rechaza campos extra y especialidades no soportadas; usa `expectedSpecialty` para detectar edición obsoleta.
- El cambio de clínica verifica que el usuario tenga una membresía activa en el destino y actualiza únicamente su sesión.
- Se registra `CLINIC_SPECIALTY_UPDATED` mediante el AuditEvent existente, con valores anterior y nuevo, en la transacción administrativa.

## Verificación ejecutada

- Suite completa del backend: **1,424 aprobadas, 0 fallos, 3 omitidas**, de 1,427 pruebas. Incluye persistencia real de recetas para DENTISTRY y PEDIATRICS, tratamientos/presupuestos/pagos, pruebas HTTP de especialidades y regresiones de agenda, consultas, pacientes, documentos, odontograma y otros módulos.
- Después del último refuerzo transaccional: **131 aprobadas, 0 fallos, 0 omitidas** en especialidades, odontograma y tratamientos. Incluye prueba adicional de conservación de asociaciones dentales históricas.
- Las tres pruebas omitidas son las pruebas optativas de PostgreSQL de inventario, que requieren una base independiente denominada `inventory_test`. Sus pruebas restantes sí se ejecutaron en la suite general.
- `npm run test:specialties`: aprobado a 1280×800 y 500×400. Prueba OWNER/PROFESSIONAL/ASSISTANT, capacidades de clínica activa, pestañas, captura dental, configuración, seis signos vitales y presentación de recetas.
- `npm run test:treatments`: aprobado en ambos tamaños; catálogo, tratamientos, presupuestos, descuentos, pagos y modales.
- `npm run test:prescriptions`: aprobado en ambos tamaños; captura estructurada, borradores, emisión, anulación, impresión, escape HTML e inmutabilidad.
- Backend: `npm run typecheck` y `npm run build`, aprobados.
- Frontend: `tsc -b` y `npm run build`, aprobados.
- `prisma generate`, `prisma validate` y aplicación de las 14 migraciones en PostgreSQL desechable, aprobados.
- Vite informa un chunk superior a 500 kB; no impide el build. No se amplió este trabajo a optimización de bundles.

Las pruebas HTTP cubren también creación de paciente por asistente, agenda para rangos de día/semana/mes, inicio y finalización de consulta desde cita, rechazo de pacientes de otra clínica, cambio de clínica, auditoría administrativa y emisión de recetas por propietario/profesional pediátrico.

## Archivos principales

- `backend/prisma/schema.prisma` y la migración indicada.
- `backend/src/modules/clinic-configuration/{capabilities,ClinicConfigurationService,clinicConfigurationRoutes,ClinicSpecialty.test}.ts`.
- `backend/src/middlewares/{auth,clinicCapability}.ts`.
- `backend/src/modules/identity/http/authController.ts` y `backend/src/app/app.ts`.
- Servicio y rutas de odontograma; servicio y pruebas de tratamientos.
- Esquema de consultas y prueba de talla decimal.
- Esquema y servicio de Patient; pruebas de Prescription para ambas especialidades.
- `frontend/src/core/auth/AuthProvider.tsx` y `frontend/src/core/router.tsx`.
- `frontend/src/features/clinic-configuration/ClinicSettings.tsx`.
- PatientDetail, PatientForm, PatientEdit y tipos de Patient.
- EncounterEditor, TreatmentEditor, TreatmentPlanSection, BudgetEditor y budgetPrint.
- PrescriptionSection y prescriptionPrint.
- `frontend/tests/clinic-specialty/`, fixture de tratamientos y script `test:specialties`.

## Límites de esta fase

- El responsable es un contacto simple, sin relaciones múltiples ni validación de representación legal.
- Se mantiene un bloque de signos vitales por consulta; no se añadieron series intraconsulta. Las mediciones fechadas permiten evolucionar el seguimiento longitudinal.
- Cambiar la especialidad no convierte ni reescribe notas, nombres de procedimientos o registros históricos. El odontograma existente se conserva y vuelve a estar disponible al configurar Odontología.
- Las recetas emitidas conservan su especialidad profesional original; cambiar la especialidad de la clínica no cambia automáticamente el perfil del profesional.
- Otras sesiones abiertas obtienen la configuración nueva al volver a cargar la sesión; el backend comprueba la capacidad vigente en cada petición dental.
- No se implementaron percentiles, curvas, vacunación, cálculo de dosis, IA clínica ni integración receta–inventario.
