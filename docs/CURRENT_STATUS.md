# Estado Actual Fotográfico

- **Fecha de Actualización:** 04 de Agosto de 2026
- **Rama Estable:** `main`
- **Commit funcional desplegado:** `7f083bb`

## Funciones Terminadas
- ✅ **Base de Datos y ORM:** Integración nativa de Prisma 7 con driver `pg`.
- ✅ **Esquema Inicial (Migración):** Modelos de identidad multitenant consolidados (`User`, `Clinic`, `Membership`, `Session`, `AuditEvent`) con llaves y UUIDs nativos. La migración `20260801191942_init_identity_clinic` está aplicada en producción.
- ✅ **Autenticación (Backend):** Middleware, login por cookie `HttpOnly`, validación en DB, logout, y endpoint genérico `/me`. Contraseñas protegidas mediante `scrypt`.
- ✅ **Autenticación (Frontend):** Proveedor de contexto (`AuthProvider`), cliente usando `fetch` nativo con `credentials: include`, y rutas privadas (`ProtectedRoute`).
- ✅ **Diseño Visual (UI):** Dashboard y Login con estilo puramente clínico (paleta clara, textos legibles en _slate_, layout moderno de panel médico, Sidebar sin saturación).
- ✅ **Contenedores:** Esquema Docker Dev y Prod diferenciados (Nginx interno para estáticos, y backend aislado).
- ✅ **Infraestructura:** Despliegue completado y operativo en DigitalOcean. El propietario productivo fue creado mediante _bootstrap_.
- ✅ **Módulo de Pacientes:** Terminado en entorno local y desplegado exitosamente en producción. Incluye listado, búsqueda, filtros, creación, edición, desactivación, reactivación y manejo de duplicados.
- ✅ **Módulo de Agenda de Citas:** Completado en local y desplegado exitosamente en producción. Incluye modelo de citas, control estricto de zonas horarias, validación de traslapes, aislamiento multi-tenant, y vistas diaria/semanal interactivas.

## Funciones Pendientes
- ❌ Consulta clínica / Expediente clínico (siguiente módulo, aún no comenzado en la futura rama `feat/clinical-encounters-foundation`).
- ❌ Odontograma y plan de tratamiento.

## Pruebas y Migraciones
- **Pruebas y Validación:**
  - 122 de 122 pruebas backend aprobadas.
  - Backend typecheck aprobado.
  - Backend build aprobado.
  - Frontend build aprobado.
  - (Histórico Pacientes): 34 pruebas backend aprobadas.
- **Pruebas Productivas:** Aprobadas íntegramente. GET `/api/health` y frontend responden HTTP 200. Flujos manuales validados: creación de citas, edición, cambio de estado, prevención de conflictos, vistas funcionales, así como pruebas productivas manuales validadas de Pacientes. Persistencia garantizada al recargar, rutas protegidas y ocultación de UUIDs técnicos.
- **Migraciones:** Las migraciones `20260802192605_add_patients_foundation` y `20260803232610_add_appointments_foundation` fueron aplicadas en producción. Prisma confirmó el esquema actualizado. Previamente se creó y verificó un respaldo PostgreSQL en formato custom.

## Estado Local y Productivo
- **Local:** Funcional, UI actualizada, pruebas en verde y bases de datos reiniciables sin impacto.
- **Productivo (VPS):** Estable en `https://yes-farma.duckdns.org`. Contenedores backend y frontend quedaron usando las nuevas imágenes de producción. PostgreSQL permanece `healthy` tras el despliegue del módulo Agenda de Citas. El proyecto Chispita no fue modificado.

## Riesgos Actuales
- **Recursos del Servidor:** El VPS en DigitalOcean tiene solo ~313 MB RAM libres y comparte recursos con el proyecto "Chispita". Existe riesgo elevado de interrupciones si se disparan procesos pesados de compilación (`npm run build`) múltiples al mismo tiempo en el servidor en caliente.

## Siguiente Incremento Recomendado
El siguiente incremento planificado es la **Consulta clínica / Expediente clínico** (rama prevista: `feat/clinical-encounters-foundation`, aún no creada).
