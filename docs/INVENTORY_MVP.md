# Inventario e insumos dentales — MVP

Implementación para revisión en `feature/inventory-mvp`, basada en `main`/`origin/main` `afcba69e572b82f267a33cd68f2426759f5be1f6`, verificado con fetch al iniciar. Sin commit, publicación, deploy, merge ni acceso a PROD/STAGING. No se modificó infraestructura.

## Recuperación de la sesión interrumpida

Se inspeccionaron status/rama/diff/diff --check y todos los archivos nuevos antes de continuar. Ya existían el schema, servicio, validadores, rutas, API frontend y formularios. Backend y frontend compilaban, pero la página, navegación, pruebas y documentación estaban pendientes. La migración estaba incompleta: tenía CHECK/trigger sin CREATE TABLE. Se completó a partir del diferencial Prisma entre el schema de HEAD y el nuevo, conservando y revisando sus restricciones.

Se encontró además una carpeta vacía no versionada `20260909120000_inventory_mvp`; se apartó a `/tmp/yeskira-inventory-empty-migration-20260909120000` sin borrar archivos. No se usaron reset, clean, stash ni checkout para descartar cambios.

## Auditoría de arquitectura e integración

- Express 5, TypeScript, Prisma 7/adapter-pg/PostgreSQL y Zod. Se sigue el patrón reciente de tratamiento: dominio, servicio de aplicación transaccional e infraestructura HTTP.
- `Clinic → Membership → User` continúa siendo el límite de tenencia y permisos. Se reutilizan `authMiddleware`, sesiones opacas, `validateOrigin` y `AppError`; no hay un sistema paralelo de permisos.
- Se reutiliza `AuditEvent` dentro de la misma transacción de cada mutación. Inventario no depende de pacientes, citas ni procedimientos.
- Frontend React/Vite/Tailwind, `apiClient` con cookies y `Modal` compartido con foco, backdrop, Escape, bloqueo de scroll y fondo inerte. Formularios con validación nativa y errores del backend.
- Se reutilizan estilos de controles del módulo de tratamientos: altura mínima, foco, contraste, borde, cursor y disabled. Las listas son grids semánticos de cards en móvil y filas con encabezados en escritorio.
- Ediciones de productos/proveedores requieren `expectedVersion`. Movimientos incrementan la versión del producto y usan Serializable, igual que la estrategia de concurrencia reciente de pagos.
- Costos usan el patrón existente: cadenas decimales en API, `Decimal(12,2)` en DB. No hay cálculo monetario con floats ni representación nueva de dinero. `Intl.NumberFormat` solo presenta MXN.
- Fechas de recepción/caducidad/efectivas son DATE. El día actual se calcula en la zona horaria de la clínica; registro/auditoría usan timestamptz. El frontend presenta DATE sin desplazamiento de zona y horas de registro en la zona de clínica.
- Respuestas privadas con `Cache-Control: private, no-store`. La configuración PWA existente mantiene API en red. No se modificaron Docker, despliegues ni variables de la aplicación.

## Entidades y relaciones

| Modelo | Propósito y campos |
|---|---|
| `InventoryProduct` | Material de una clínica: nombre, descripción, categoría flexible, unidad libre, mínimo, proveedor principal opcional, costo de referencia opcional, activo, versión y fechas |
| `InventorySupplier` | Nombre, contacto/teléfono/email/notas opcionales, activo, versión y fechas; catálogo propio de la clínica |
| `InventoryLot` | Recepción concreta: producto/clínica, número y caducidad opcionales, fecha de recepción, proveedor/costo opcionales, cantidad inicial y fecha de registro |
| `InventoryMovement` | Registro inmutable: producto/clínica/lote, tipo, cantidad positiva, fecha efectiva, motivo, nota/costo opcionales, membresía creadora y fecha de registro |

No existe `product.stock` editable ni un saldo mutable independiente del historial. `initialQuantity` es la cantidad documentada al crear una recepción, no su saldo actual.

Categorías: campo flexible de texto con sugerencias dentales en la UI. Permite nuevas categorías sin otro catálogo ni migraciones. Unidad libre, cantidades con hasta tres decimales (`Decimal(14,3)`); máximo por movimiento 99,999,999,999.999. La unidad no se puede cambiar después del primer movimiento, para preservar el significado del historial. Para otra presentación/unidad se crea otro producto.

Las FK compuestas unen producto/proveedor por clínica; lote/producto/proveedor por clínica; movimiento/lote por clínica y producto; creador por clínica y membresía. Las FK tienen eliminación restrictiva. No hay endpoints DELETE para inventario.

## Movimientos y stock

| Tipo | Presentación | Efecto | Motivo |
|---|---|---|---|
| ENTRY | Entrada | + cantidad | Opcional; default auditable «Recepción de material» |
| CONSUMPTION | Consumo | − cantidad | Opcional; default auditable «Uso clínico» |
| WASTE | Merma | − cantidad | Obligatorio; UI sugiere rotura, contaminación, caducidad, daño, error u otro |
| ADJUSTMENT_IN | Ajuste + | + cantidad | Obligatorio |
| ADJUSTMENT_OUT | Ajuste − | − cantidad | Obligatorio |

Existencia de lote = suma de entradas/ajustes positivos − consumos/mermas/ajustes negativos. Existencia total del producto = suma de todos sus lotes. Cálculos con `Prisma.Decimal`, sin deriva de coma flotante. El listado agrega movimientos en PostgreSQL por lote/tipo; no carga todos los registros históricos para dibujar el dashboard.

Solo se admiten cantidades positivas. Una salida se valida contra el saldo de su lote; no puede usar la disponibilidad de otro lote como si fuera propia. Si una salida utiliza dos lotes, se registran dos movimientos explícitos. No hay reparto automático.

Fechas futuras o anteriores a la recepción se rechazan. La fecha efectiva documenta cuándo ocurrió la operación, pero la transacción afecta el saldo actual al registrarse; este MVP no construye cierres históricos ni recalcula balances diarios retrospectivos.

El backend rechaza stock negativo y devuelve conflicto comprensible. No hay edición/cancelación/borrado de movimientos en la UI/API. PostgreSQL también rechaza UPDATE/DELETE de `InventoryMovement` mediante trigger. Las correcciones se registran como movimientos compensatorios; los ajustes exigen motivo y permiso de propietario. No se implementó una cancelación compleja ni un vínculo automático entre el movimiento erróneo y su compensación: puede indicarse en la nota.

## Lotes y caducidades

Cada entrada crea una recepción interna, incluso sin número de lote ni caducidad. No se obliga a inventar esos datos. La UI la identifica como «Sin número de lote» con fecha y referencia corta. Dos recepciones pueden compartir número de lote; conservan costos/proveedores y trazabilidad propios.

Ajuste positivo puede referir un lote existente o crear una nueva existencia documentada. Salidas seleccionan una existencia explícita; el formulario sugiere la primera utilizable según caducidad ascendente, recepción e ID. Lotes sin caducidad aparecen después. Los agotados se conservan en el detalle; solo los disponibles se ofrecen para salidas.

La regla está centralizada en `InventorySchema.ts`: `EXPIRY_WARNING_DAYS = 30`.

- Sin caducidad o más de 30 días: NORMAL.
- Entre hoy y 30 días inclusive: EXPIRING / Próximo a caducar.
- Fecha anterior al día actual de la clínica: EXPIRED / Caducado.
- Mensajes derivados: «Caduca en 18 días», «Caduca hoy», «Caducado hace 5 días».
- Un lote que caduca hoy sigue utilizable durante ese día; al siguiente día ya no lo es.
- Los caducados se incluyen en existencia física total, pero se excluyen de `usableStock`. Consumo se bloquea incluso si se intenta registrar con fecha anterior. Merma/ajuste negativo permiten retirarlos de la existencia física.
- Se permite documentar una recepción ya caducada con aviso explícito en el formulario; nunca se suma a existencia utilizable.

Estados de stock derivados sobre cantidad utilizable: EMPTY/Agotado si cero; LOW/Bajo stock si menor al mínimo; NORMAL en otro caso. No se persisten estados. El dashboard cuenta productos activos, incluidos los productos con lotes próximos a caducar o caducados que aún tengan saldo.

## Permisos

| Rol existente | Consulta completa | Entrada / consumo / merma | Productos / proveedores / mínimos / desactivaciones / ajustes |
|---|---|---|---|
| OWNER | Sí | Sí | Sí |
| PROFESSIONAL | Sí | Sí | No |
| ASSISTANT | Sí | Sí | No |

No existen enums independientes ADMIN o RECEPTIONIST en el proyecto. Una cuenta de recepción con ASSISTANT tiene todos los permisos cotidianos de ese rol. OWNER representa al propietario/administrador existente. No se agregaron roles ni se exige ProfessionalProfile para inventario.

Todos ven cantidades, lotes, caducidades, alertas, movimientos y proveedores/contactos. «Inventario» aparece en navegación principal de escritorio y móvil. La UI usa `canManage` calculado por el backend para controles administrativos; el backend vuelve a consultar la membresía real y no confía en el rol enviado por cliente/contexto falsificado. Membresías suspendidas, usuarios deshabilitados y clínicas suspendidas no acceden.

Producto inactivo conserva lectura, lotes y movimientos; no acepta movimientos hasta reactivación por OWNER. Proveedor inactivo conserva referencias históricas y puede consultarse, pero no se acepta para nuevas recepciones/asociaciones. Los productos inactivos se ocultan por defecto del listado; un filtro permite consultarlos.

## Auditoría, aislamiento y concurrencia

Cada creación/edición/desactivación de producto o proveedor produce un AuditEvent con clínica, usuario, entidad, acción, before/after y fecha. Cambios de mínimo quedan incluidos. Cada movimiento produce `INVENTORY_<TYPE>` con todos sus valores, creador, motivo y fechas, dentro de la misma transacción. Un fallo de auditoría revierte recepción, movimiento y versión.

`clinicId` y creador provienen de la sesión. Zod estricto rechaza campos extra como clínica, actor o stock. Todos los servicios filtran por clínica; las relaciones compuestas refuerzan las fronteras en PostgreSQL. Conocer un ID de otra clínica no concede acceso. No se agregó RLS como sistema paralelo al patrón de tenencia actual.

Mutaciones en aislamiento Serializable. Todos los escritores de stock actualizan la misma fila de InventoryProduct incrementando version, antes de validar y registrar el movimiento. Dos snapshots simultáneos no pueden confirmar una salida usando la misma disponibilidad. Prisma P2034 se traduce a `CONCURRENCY_ERROR` HTTP 409. No se reintenta automáticamente una operación de stock: el usuario debe revisar/actualizar existencias.

Pruebas reales con dos usuarios y conexiones independientes:

- Stock 5, consumos 4 + 4: un éxito, un conflicto/error de disponibilidad, saldo 1, una auditoría de consumo.
- Stock 5, consumos 5 + 5: un éxito, otro rechazo, saldo 0.
- Fallos de stock/auditoría no dejan movimientos, recepciones ni incrementos parciales de versión.

La garantía de no-negatividad aplica a las escrituras del servicio transaccional; scripts futuros no deben insertar movimientos directamente omitiendo estas reglas.

## Endpoints

Prefijo `/api/inventory`; requieren sesión, origen válido en escrituras y membresía activa.

| Método | Ruta | Resultado |
|---|---|---|
| GET | / | Dashboard, productos, lotes/saldos, proveedores, 20 movimientos recientes, día/zona y permiso administrativo |
| POST | /products | Crear producto (OWNER) |
| GET | /products/:id | Detalle, lotes/saldos y hasta 100 movimientos recientes |
| PATCH | /products/:id | Formulario completo + expectedVersion; editar, desactivar o reactivar (OWNER) |
| POST | /products/:id/movements | Entrada/consumo/merma/ajuste; movimiento y saldo actualizado; 201 |
| POST | /suppliers | Crear proveedor (OWNER) |
| PATCH | /suppliers/:id | Formulario completo + expectedVersion; editar/desactivar/reactivar (OWNER) |

IDs de ruta validados como UUID. Cantidades y costos viajan como cadenas decimales. Referencias no disponibles devuelven 404/400; conflictos de stock, caducidad, producto inactivo, unidad bloqueada o versión devuelven 409; permisos 403; validación 400. Las mutaciones no aceptan tenant/actor/stock desde el cliente.

## UI y decisiones de uso

Ruta principal `/inventory`; detalle enlazable `/inventory/products/:id`. Dashboard con cinco indicadores, alertas legibles, listado con búsqueda/categoría/estado/inactivos, proveedores y movimientos recientes. Detalle con cantidad utilizable y total separadas, mínimo, proveedor/costo, lotes e historial.

Botones explícitos: Registrar entrada, Registrar consumo, Registrar merma, Ajustar inventario +/−, Editar producto, Nuevo proveedor. Salidas deshabilitadas si no hay stock adecuado; todas las operaciones deshabilitadas para producto inactivo. Feedback success/error visible; no hay cierre silencioso. Mientras se envía, se bloquean controles y cierre del modal. Conflictos conservan formulario y explican que se debe actualizar antes de reintentar.

El formulario de producto usa información avanzada desplegable para descripción/costo; el de movimiento permite omitir número, fecha de caducidad, proveedor y costo. El selector muestra saldos y caducidad de cada recepción, con FEFO sugerido y selección explícita. Estados con texto además de color.

Al volver a la pestaña o cada minuto sin formulario abierto se recargan estados derivados. Cambio de clínica/producto remonta la vista; respuestas de solicitudes obsoletas se ignoran. Las consultas fallidas muestran Reintentar carga y no ofrecen operaciones sobre información que no se pudo actualizar.

Se corrigió un defecto visual encontrado al probar inventario largo: `transform` persistente de la animación del MainLayout desplazaba la barra móvil fija al final del contenido. Se retiró esa animación del contenedor y se añadió min-w-0. La barra vuelve a permanecer dentro del viewport; no se alteró el sistema de modales.

## Migración y validación local

Migración aditiva: `20260910030000_add_inventory_mvp`. Crea cuatro tablas, un enum, siete FK, doce índices (incluidas PK/unique), CHECK de cantidades/costos/versiones y trigger de inmutabilidad. No altera datos de tablas existentes ni precarga catálogos/fixtures. Índices cubren clínica/activo/nombre, lote/producto/caducidad y movimientos por clínica/fecha o clínica/producto/lote. No se agregaron índices de tipo sin una consulta que los necesite.

`scripts/check-inventory-migration.cjs` apunta exclusivamente al PostgreSQL desechable local `127.0.0.1:55440/inventory_test`, sin cargar .env. Crea esquema aleatorio, aplica las 11 migraciones anteriores, inserta fixtures de Clinic/User/Membership/Patient/TreatmentBudget, aplica inventario y compara todos los valores anteriores. Verifica tablas nuevas vacías, FK e índices. `prisma migrate deploy` también aplicó las 12 migraciones a public en esa misma DB desechable.

Para repetir, usar únicamente un PostgreSQL desechable equivalente; desde backend:

```sh
node scripts/check-inventory-migration.cjs
node scripts/test-inventory-local.cjs
node scripts/test-inventory-local.cjs --all
npm run typecheck
npm run build
```

El runner usa el esquema registrado en `/tmp/yeskira-inventory-test-schema` y configura opt-in para pruebas de inventario y tratamientos/pagos. Las pruebas de inventario además rechazan hosts no locales y nombres de DB distintos de inventory_test. No recurren a DATABASE_URL. Fixtures permanecen solo en el esquema desechable para permitir varias conexiones en las pruebas de concurrencia.

Desde frontend:

```sh
npm run build
npm run lint
npm run test:modals
npm run test:treatments
npm run test:inventory
npm run review:inventory
```

Pruebas de navegador usan Chrome local instalado, API simulada, usuarios/materiales sintéticos y perfiles temporales. No necesitan cuentas ni datos clínicos. La revisión visual usa Chrome DevTools Protocol para emular exactamente 1280×960 y 390×844, y deja PNG y report.json en `/tmp/yeskira-inventory-visual-review`.

### Resultados finales

- Backend: typecheck/build aprobados. Suite completa: **1,411 pruebas aprobadas, 0 fallos, 0 omitidas**, incluidas persistencia de tratamientos/pagos e inventario.
- Inventario backend: **67 pruebas aprobadas**, con esquema/validaciones, HTTP sin sesión, persistencia, roles, tenant isolation, auditoría, reversión de errores, caducidades y concurrencia real.
- Frontend: build/lint aprobados. **119 comprobaciones de inventario**, **42 de modales** y **78 de tratamientos/pagos/impresión** aprobadas (239 comprobaciones de navegador en total).
- Prisma validate aprobado; migración desde toda la cadena anterior y migrate deploy en DB desechable aprobados; cinco tablas anteriores intactas.
- Revisión visual: 14 estados en escritorio y móvil, 28 vistas con captura inicial y captura completa o inferior del modal. Incluye vacío, dashboard con normal/bajo/agotado/por caducar/caducado, sin recepciones, varios lotes, entrada, consumo, merma, ajustes +/−, producto, proveedores, inactivo y detalle normal. Sin overflow horizontal; controles inferiores alcanzables con scroll.
- Diez warnings de lint preexistentes (auth, pacientes, citas, dashboard y arnés UX previo de tratamientos); ninguno en archivos de inventario. Aviso preexistente de chunk frontend >500 kB: principal pasa de ~598.55 a ~626.52 kB. Sin dependencias nuevas.
- Revisión de diff/secretos/dependencias/infraestructura: cambios limitados al módulo, integración, pruebas y documentación; sin credenciales reales ni cambios de Docker/infra. Las credenciales de DB incluidas en scripts son únicamente las del contenedor desechable de pruebas.

## Límites deliberados y mejoras futuras

Listado/categorías filtrados en cliente, catálogo completo por clínica; movimientos visibles limitados a los recientes. Antes de escalar a catálogos/historiales grandes, agregar paginación y consultas específicas de dashboard. No hay stock histórico por fecha, múltiples almacenes ni cierres.

Próximas mejoras posibles: idempotencia ante respuesta perdida/reenvío, vínculo explícito entre movimiento y compensación, política configurable de días de caducidad, permisos más granulares si la arquitectura central los incorpora, búsqueda/historial paginado y pruebas de aceptación con una clínica sobre entorno autorizado. La revisión visual actual es real en navegador con mocks; no se afirma haber realizado una sesión integrada con datos de una clínica real.

Fuera de alcance: órdenes de compra, cuentas por pagar, SAT/facturación/impuestos/contabilidad, almacenes/transferencias, códigos/QR, automatización de consumo por tratamiento, paciente obligatorio, proveedores externos/marketplace, IA o predicción.

## Archivos de la entrega

28 archivos: 7 modificados y 21 nuevos.

- `backend/prisma/schema.prisma`
- `backend/src/app/app.ts`
- `frontend/package.json`
- `frontend/src/core/router.tsx`
- `frontend/src/shared/components/BottomNav/BottomNav.tsx`
- `frontend/src/shared/components/Layout/MainLayout.tsx`
- `frontend/src/shared/components/Sidebar/Sidebar.tsx`
- `backend/prisma/migrations/20260910030000_add_inventory_mvp/migration.sql`
- `backend/scripts/check-inventory-migration.cjs`
- `backend/scripts/test-inventory-local.cjs`
- `backend/src/modules/inventory/InventoryPersistence.test.ts`
- `backend/src/modules/inventory/InventoryRoutes.test.ts`
- `backend/src/modules/inventory/InventorySchema.test.ts`
- `backend/src/modules/inventory/application/InventoryService.ts`
- `backend/src/modules/inventory/domain/InventorySchema.ts`
- `backend/src/modules/inventory/infrastructure/inventoryRoutes.ts`
- `docs/INVENTORY_MVP.md`
- `frontend/src/features/inventory/InventoryForms.tsx`
- `frontend/src/features/inventory/InventoryPage.tsx`
- `frontend/src/features/inventory/api.ts`
- `frontend/src/features/inventory/presentation.ts`
- `frontend/src/features/inventory/types.ts`
- `frontend/tests/inventory/fixtures.ts`
- `frontend/tests/inventory/index.html`
- `frontend/tests/inventory/run.mjs`
- `frontend/tests/inventory/styles.css`
- `frontend/tests/inventory/viewport.tsx`
- `frontend/tests/inventory/visual-review.mjs`

El contenedor local `yeskira-inventory-test-20260909` quedó detenido al terminar las pruebas, conservando sus esquemas sintéticos. Los PNG y logs de validación permanecen en `/tmp`.
