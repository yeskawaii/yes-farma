# Cobranza e impresión de presupuestos

Rama: `feature/payments-budget-pdf`. Se extiende el módulo existente; no se reconstruyen tratamientos ni presupuestos.

## Auditoría y arquitectura

Se reutilizan Patient, PatientTreatment, TreatmentBudget, TreatmentBudgetItem, Clinic, Membership, ProfessionalProfile, AuditEvent, TreatmentService, Zod estricto, authMiddleware, validateOrigin, AppError, apiClient, Modal y el formateador MXN. Clinic solo proporciona nombre/zona horaria; no tiene dirección/contacto. Patient no tiene folio clínico humano. Budget no tiene observaciones ni cantidades. Cada concepto tiene precio propio. El almacenamiento documental existente descarga archivos cargados, pero no genera documentos. No había biblioteca PDF ni impresión reutilizable. No se agregan datos supuestos ni notas clínicas al documento.

## Datos

Migración: `20260908180000_add_budget_payments`.

- Nueva tabla BudgetPayment: clínica/paciente/presupuesto, importe Decimal(12,2), fecha efectiva DATE, fecha de registro, método, referencia, notas, creador y cancelación.
- PaymentMethod: CASH, TRANSFER, CARD, OTHER. PaymentStatus: ACTIVE, CANCELLED.
- FK compuestas al presupuesto y membresías impiden asociaciones entre clínicas/pacientes. Clínica/paciente quedan vinculados mediante el presupuesto y sus FK existentes.
- Índice de historial; CHECK de monto positivo y consistencia de cancelación.
- TreatmentBudget.folio nullable, único por clínica. Nuevos presupuestos: `P-` con 16 caracteres aleatorios. Históricos: mantienen referencia corta existente, sin backfill ni reescritura. No es folio fiscal.

## Reglas

Solo ACCEPTED y pacientes activos reciben abonos. OWNER/PROFESSIONAL requieren membresía y perfil activos. Backend permite consultar/cancelar en pacientes inactivos; la UI conserva el modo de solo lectura existente de esos expedientes.

El cliente solo envía monto como texto decimal (dos decimales), método, fecha, referencia y notas. Asociaciones, actores, estado y saldos no son editables. `paid = suma en centavos de pagos ACTIVE`; `balance = total snapshot - paid`. UNPAID/PARTIAL/PAID son derivados; total cero equivale a PAID. Máximo por movimiento: 9,999,999,999.99 MXN, conforme al validador existente. Sobreabonos rechazados con HTTP 409; sin saldo a favor.

Crear/cancelar usan Serializable y actualizan la misma fila de presupuesto incrementando version. Dos cobros concurrentes no pueden confirmar usando el mismo saldo. P2034 se convierte en CONCURRENCY_ERROR (409); requiere recargar/revisar antes de reintentar, sin reintento automático financiero. Movimiento y PAYMENT_CREATED/PAYMENT_CANCELLED usan AuditEvent en la misma transacción. Cobranza no cambia estados clínicos.

No hay DELETE ni edición del monto. Cancelación exige motivo, conserva monto/fecha/creador y registra cancelledAt, cancelledByMembershipId y cancellationReason. Restaura saldo y rechaza doble cancelación.

## API y UI

Base: `/api/patients/:patientId/budgets/:id`.

| Método | Sufijo | Resultado |
|---|---|---|
| GET | /payments | Presupuesto, historial y saldos |
| POST | /payments | Movimiento, HTTP 201 |
| POST | /payments/:paymentId/cancel | Cancelación con cancellationReason |
| GET | /print | JSON de snapshot, clínica, paciente y saldos |

Sesión, origen, permisos y alcance clínica/paciente/presupuesto/pago obligatorios. Respuestas de presupuestos private, no-store. El plan devuelve saldos sin historial completo.

BudgetPayments.tsx incorpora captura, historial y confirmación dentro de Modal. TreatmentPlanSection agrega acciones y resumen en el desplegable existente. paymentPresentation.ts centraliza etiquetas. budgetPrint.ts genera HTML escapado desde el snapshot guardado. Incluye clínica, nombre del paciente, folio/referencia, estado, fecha en zona de clínica, conceptos, pieza, descripción, importes, subtotal, descuento, total, pagado y saldo.

Imprimir y Guardar como PDF abren previsualización; window.print permite imprimir o elegir Guardar como PDF. No es descarga binaria directa. CSS oculta controles, repite cabecera, evita dividir filas cuando es posible, admite A4/Letter y móvil. MXN usa formateador existente. Cero dependencias nuevas o servicios externos.

## Verificación

Backend: npm test, npm run typecheck, npm run build, npx prisma validate. Resultado: 1,343 aprobados, 0 fallidos, 0 omitidos con PostgreSQL real. Concurrencia real: dos pagos de 70 sobre saldo 100 dejan un movimiento, una auditoría y saldo 30.

TREATMENT_TEST_DATABASE_URL es opt-in exclusivo para base desechable migrada. TREATMENT_TEST_DATABASE_SCHEMA selecciona esquema (default public). La prueba original revierte fixtures; la de concurrencia deja fixtures en la base desechable para usar conexiones independientes.

scripts/check-budget-payments-migration.cjs está fijado al PostgreSQL desechable local (55439/payments_test), no carga .env, crea un esquema nuevo y prueba toda la cadena. Inserta presupuesto antes de la migración final y compara todos sus campos después. Resultado: 11 migraciones aprobadas y presupuesto anterior intacto.

Frontend: npm run build, npm run lint, npm run test:modals, npm run test:treatments. Resultado: builds aprobados; 42 comprobaciones de modales y 44 de tratamientos/cobranza/documento, cero fallos, en 1280×800 y 500×400. Prisma validate y typecheck aprobados.

Fixtures visuales: desde raíz ejecutar `node --import ./backend/node_modules/tsx/dist/loader.mjs frontend/tests/treatment-plans/print-fixtures.ts`; desde frontend `node tests/treatment-plans/print-review.mjs`. Artefactos sintéticos en /tmp/yeskira-budget-print-review. Casos de 1/40 filas, con/sin pieza, descuento, nombres largos y estados sin pagos/parcial/pagado.

Warnings preexistentes: nueve de lint en auth/pacientes/citas/dashboard y aviso de bundle frontend mayor de 500 kB. Ninguno nuevo en cobranza.

## Límites y siguiente fase

PDF depende del diálogo del navegador y papel elegido. Folios históricos no se rellenan. Mejoras posteriores: datos de contacto de clínica, observaciones propias de presupuesto, recibos individuales, paginación del historial, idempotencia ante reintentos por pérdida de conexión y permisos financieros separados si se requieren.

No se implementa facturación fiscal, pasarela ni contabilidad. No hay cambios Docker/CI/CD, deploy, merge, push, tags/releases ni acceso a PROD/STAGING.

Revisión visual final: seis PDFs reales generados por Chrome, sin controles de impresión ni instrucciones dentro del PDF (verificados con PDFKit). Casos de un concepto: una página; casos de 40 conceptos: cinco páginas, cabeceras repetidas y filas sin cortes en los ejemplos revisados. Se revisaron capturas de escritorio/móvil y páginas iniciales, intermedias y finales. El contenedor local `yeskira-payments-test-20260908` quedó detenido conservando los fixtures; los artefactos PDF/PNG siguen en /tmp. `git diff --check` aprobado.
