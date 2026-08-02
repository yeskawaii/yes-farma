# Estado Actual Fotográfico

- **Fecha de Actualización:** 02 de Agosto de 2026
- **Rama Actual:** `docs/project-continuity`
- **Commit Estable Referencia:** `78d3ce0 feat(ui): refresh clinical interface` (mezclado en `main`)

## Funciones Terminadas
- ✅ **Base de Datos y ORM:** Integración nativa de Prisma 7 con driver `pg`.
- ✅ **Esquema Inicial (Migración):** Modelos de identidad multitenant consolidados (`User`, `Clinic`, `Membership`, `Session`, `AuditEvent`) con llaves y UUIDs nativos. La migración `20260801191942_init_identity_clinic` está lista.
- ✅ **Autenticación (Backend):** Middleware, login por cookie `HttpOnly`, validación en DB, logout, y endpoint genérico `/me`. Contraseñas protegidas mediante `scrypt`.
- ✅ **Autenticación (Frontend):** Proveedor de contexto (`AuthProvider`), cliente _axios_ interceptado, rutas privadas (`ProtectedRoute`).
- ✅ **Diseño Visual (UI):** Dashboard y Login con estilo puramente clínico (paleta clara, textos legibles en _slate_, layout moderno de panel médico, Sidebar sin saturación).
- ✅ **Contenedores:** Esquema Docker Dev y Prod diferenciados (Nginx interno para estáticos, y backend aislado).

## Funciones Parcialmente Terminadas
- ⚠️ **Infraestructura:** Despliegue listo en DigitalOcean, con el Docker Compose actualizado, pero **el despliegue del nuevo código de identidad y autenticación a producción está pendiente**.

## Funciones Pendientes
- ❌ Despliegue seguro a producción y bootstrap de propietario productivo.
- ❌ Módulo CRUD de Pacientes.
- ❌ Módulo de Agenda de Citas médicas.
- ❌ Expedientes Clínicos.

## Pruebas y Migraciones
- **Pruebas (Backend):** Pruebas unitarias de criptografía y validación de sesiones en `CryptoService.test.ts`.
- **Migraciones:** Existe la migración generada `20260801191942_init_identity_clinic`.

## Estado Local y Productivo
- **Local:** Funcional, UI actualizada, pruebas en verde y bases de datos reiniciables sin impacto.
- **Productivo (VPS):** Funciona y responde 200 a `/api/health`, pero **aún posee el código viejo** sin el módulo de sesión clínica implementado en DB. 

## Riesgos Actuales
- **Recursos del Servidor:** El VPS en DigitalOcean tiene solo ~313 MB RAM libres y comparte recursos con el proyecto "Chispita". Existe riesgo elevado de interrupciones si se disparan procesos pesados de compilación (`npm run build`) múltiples al mismo tiempo en el servidor en caliente.
- **Despliegue Ciego:** Si se omite la revisión de variables de entorno o si se hace `prisma migrate reset` en producción se dañarán los datos productivos.

## Siguiente Incremento Recomendado
Ejecutar paso a paso el Runbook de Despliegue (`DEPLOYMENT_RUNBOOK.md`) para subir la base funcional a DigitalOcean, verificar el _health_ productivo y entonces ramificar para atacar el módulo de **Pacientes**.
