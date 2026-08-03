# Estado Actual Fotográfico

- **Fecha de Actualización:** 03 de Agosto de 2026
- **Rama Actual:** `main`
- **Commit Estable Referencia:** `931563a`

## Funciones Terminadas
- ✅ **Base de Datos y ORM:** Integración nativa de Prisma 7 con driver `pg`.
- ✅ **Esquema Inicial (Migración):** Modelos de identidad multitenant consolidados (`User`, `Clinic`, `Membership`, `Session`, `AuditEvent`) con llaves y UUIDs nativos. La migración `20260801191942_init_identity_clinic` está aplicada en producción.
- ✅ **Autenticación (Backend):** Middleware, login por cookie `HttpOnly`, validación en DB, logout, y endpoint genérico `/me`. Contraseñas protegidas mediante `scrypt`.
- ✅ **Autenticación (Frontend):** Proveedor de contexto (`AuthProvider`), cliente usando `fetch` nativo con `credentials: include`, y rutas privadas (`ProtectedRoute`).
- ✅ **Diseño Visual (UI):** Dashboard y Login con estilo puramente clínico (paleta clara, textos legibles en _slate_, layout moderno de panel médico, Sidebar sin saturación).
- ✅ **Contenedores:** Esquema Docker Dev y Prod diferenciados (Nginx interno para estáticos, y backend aislado).
- ✅ **Infraestructura:** Despliegue completado y operativo en DigitalOcean. El propietario productivo fue creado mediante _bootstrap_.
- ✅ **Módulo de Pacientes:** Terminado en entorno local y desplegado exitosamente en producción. Incluye listado, búsqueda, filtros, creación, edición, desactivación, reactivación y manejo de duplicados.

## Funciones Pendientes
- ❌ Módulo de Agenda de Citas médicas.
- ❌ Expedientes Clínicos.
- ❌ Odontograma y demás módulos no construidos.

## Pruebas y Migraciones
- **Pruebas y Validación (Pacientes):** 34 pruebas backend aprobadas y pruebas productivas manuales validadas.
- **Pruebas Productivas:** Aprobadas íntegramente. GET `/api/health` responde HTTP 200. Persistencia garantizada al recargar, rutas protegidas tras cerrar sesión y ocultación de UUIDs técnicos.
- **Migraciones:** La migración `20260802192605_add_patients_foundation` fue aplicada en producción. `prisma migrate status` confirmó el esquema actualizado. Previamente se creó y verificó un respaldo PostgreSQL en formato custom.

## Estado Local y Productivo
- **Local:** Funcional, UI actualizada, pruebas en verde y bases de datos reiniciables sin impacto.
- **Productivo (VPS):** Estable en `https://yes-farma.duckdns.org`. Backend, frontend y PostgreSQL están operativos tras el despliegue del módulo Pacientes. Base de datos `healthy`.

## Riesgos Actuales
- **Recursos del Servidor:** El VPS en DigitalOcean tiene solo ~313 MB RAM libres y comparte recursos con el proyecto "Chispita". Existe riesgo elevado de interrupciones si se disparan procesos pesados de compilación (`npm run build`) múltiples al mismo tiempo en el servidor en caliente.

## Siguiente Incremento Recomendado
El siguiente incremento es la **Agenda de Citas**.
