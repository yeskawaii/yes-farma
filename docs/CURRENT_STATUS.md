# Estado Actual Fotográfico

- **Fecha de Actualización:** 02 de Agosto de 2026
- **Rama Actual:** `main`
- **Commit Estable Referencia:** `d15e0b9 fix(docker): include Prisma config in production image`

## Funciones Terminadas
- ✅ **Base de Datos y ORM:** Integración nativa de Prisma 7 con driver `pg`.
- ✅ **Esquema Inicial (Migración):** Modelos de identidad multitenant consolidados (`User`, `Clinic`, `Membership`, `Session`, `AuditEvent`) con llaves y UUIDs nativos. La migración `20260801191942_init_identity_clinic` está aplicada en producción.
- ✅ **Autenticación (Backend):** Middleware, login por cookie `HttpOnly`, validación en DB, logout, y endpoint genérico `/me`. Contraseñas protegidas mediante `scrypt`.
- ✅ **Autenticación (Frontend):** Proveedor de contexto (`AuthProvider`), cliente usando `fetch` nativo con `credentials: include`, y rutas privadas (`ProtectedRoute`).
- ✅ **Diseño Visual (UI):** Dashboard y Login con estilo puramente clínico (paleta clara, textos legibles en _slate_, layout moderno de panel médico, Sidebar sin saturación).
- ✅ **Contenedores:** Esquema Docker Dev y Prod diferenciados (Nginx interno para estáticos, y backend aislado).
- ✅ **Infraestructura:** Despliegue completado y operativo en DigitalOcean. El propietario productivo fue creado mediante _bootstrap_.
- ✅ **Módulo de Pacientes (Local):** Terminado en entorno local y pendiente de producción. Incluye creación, edición, desactivación, reactivación, listado y detalle.

## Funciones Pendientes
- ❌ Despliegue productivo del módulo de Pacientes.
- ❌ Módulo de Agenda de Citas médicas.
- ❌ Expedientes Clínicos.

## Pruebas y Migraciones
- **Pruebas y Validación (Pacientes):** 34 pruebas backend aprobadas, build local exitoso y prueba manual local validada correctamente.
- **Pruebas Productivas:** Aprobadas (Health devuelve HTTP 200, Login correcto, redirección a `/dashboard`, persistencia de sesión al recargar y cerrar navegador, logout efectivo, barrera en rutas privadas).
- **Migraciones:** La migración productiva inicial fue aplicada exitosamente (`npx prisma migrate deploy`) y el esquema está sincronizado. (Aún pendiente aplicar la migración Patient en producción).

## Estado Local y Productivo
- **Local:** Módulo de Pacientes funcionalmente completo, pruebas y build aprobados, y bases de datos reiniciables sin impacto.
- **Productivo (VPS):** Estable y operativo en `https://yes-farma.duckdns.org` (todavía sin la migración Patient). Frontend y backend en línea (`Up`), base de datos `healthy`, y conexión segura con validación CORS funcional.

## Riesgos Actuales
- **Recursos del Servidor:** El VPS en DigitalOcean tiene solo ~313 MB RAM libres y comparte recursos con el proyecto "Chispita". Existe riesgo elevado de interrupciones si se disparan procesos pesados de compilación (`npm run build`) múltiples al mismo tiempo en el servidor en caliente.

## Siguiente Incremento Recomendado
El siguiente paso operativo es el **despliegue seguro de Pacientes**. El siguiente incremento posterior será la **Agenda de Citas**.
