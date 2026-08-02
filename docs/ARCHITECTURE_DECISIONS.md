# Decisiones de Arquitectura (ADRs)

Este documento registra las decisiones arquitectónicas (Architecture Decision Records) clave tomadas para el proyecto Yes Farma.

### ADR-001 Clinic como tenant
- **Estado:** Aprobado y aplicado.
- **Contexto:** Se requiere escalar de consultorios de un profesional a clínicas multiprofesional.
- **Decisión:** `Clinic` será la raíz organizativa. Toda la información médica pertenecerá a una clínica, actuando como tenant.
- **Consecuencias:** Facilita el aislamiento de datos y permite a un `User` pertenecer a múltiples clínicas.

### ADR-002 Rol en Membership
- **Estado:** Aprobado y aplicado.
- **Contexto:** Un usuario puede ser propietario en su clínica, pero médico invitado en otra.
- **Decisión:** El `role` (`OWNER`, `PROFESSIONAL`, `ASSISTANT`) reside en la tabla `Membership`, no en la tabla `User`.
- **Consecuencias:** Los permisos se validan evaluando la membresía del usuario contra la clínica en contexto.

### ADR-003 Sesiones opacas en lugar de JWT
- **Estado:** Aprobado y aplicado.
- **Contexto:** Es vital invalidar sesiones instantáneamente en un software médico si hay brechas de seguridad o despidos.
- **Decisión:** Se usarán tokens de sesión opacos y persistidos en PostgreSQL (`Session`). La validación verifica la base de datos.
- **Consecuencias:** Mayor carga a la DB por validación, pero máxima seguridad y control de revocación.
- **Alternativas Rechazadas:** JSON Web Tokens (JWT) por su complejidad de revocación sin estado.

### ADR-004 Cookies HttpOnly
- **Estado:** Aprobado y aplicado.
- **Contexto:** La prevención contra Cross-Site Scripting (XSS) es crítica.
- **Decisión:** El token opaco se enviará y recibirá exclusivamente a través de cookies marcadas como `HttpOnly`, `Secure` y `SameSite`.
- **Consecuencias:** El cliente React no puede leer el token, reduciendo vectores de ataque.
- **Alternativas Rechazadas:** Almacenamiento en `localStorage`, altamente vulnerable a ataques XSS.

### ADR-005 Prisma 7 con adapter PostgreSQL
- **Estado:** Aprobado y aplicado.
- **Contexto:** Uso de ORM moderno tipado con TypeScript.
- **Decisión:** Se actualizará a Prisma 7 utilizando el driver nativo `pg` a través de `@prisma/adapter-pg`. 
- **Consecuencias:** Obliga a configurar el cliente usando un adapter y a quitar `url` directo del provider del schema, inyectándolo vía `prisma.config.ts`.

### ADR-006 Separación Docker dev/prod
- **Estado:** Aprobado y aplicado.
- **Contexto:** Se necesitan entornos similares pero con diferentes flujos (Vite HMR local vs Nginx servido estático productivo).
- **Decisión:** Existirá un `docker-compose.yml` base, extendido por `docker-compose.dev.yml` (montaje de volúmenes) y `docker-compose.prod.yml` (builds estáticos).
- **Consecuencias:** Evita colisiones de dependencias, pero exige usar los flags precisos al levantar contenedores.

### ADR-007 Base de datos sin puerto público
- **Estado:** Aprobado y aplicado.
- **Contexto:** Proteger la información médica (PostgreSQL) en el servidor VPS en la nube.
- **Decisión:** PostgreSQL (contenedor `db`) solo estará anclado a la red interna `app-network`. No publicará el puerto 5432 al _host_.
- **Consecuencias:** Mayor seguridad. Las migraciones y accesos deben hacerse internamente a través de un contenedor aliado (ej. `backend`).

### ADR-008 Migraciones revisadas antes de aplicar
- **Estado:** Aprobado.
- **Contexto:** Prisma puede realizar operaciones destructivas (`DROP`, `TRUNCATE`) automáticamente.
- **Decisión:** Siempre se usará `npx prisma migrate dev --create-only` para generar el SQL, se debe revisar manualmente, y solo entonces aplicarlo.
- **Consecuencias:** Un paso extra en el flujo de desarrollo, pero previene borrados de tablas catastróficos.

### ADR-009 Registro público deshabilitado
- **Estado:** Aprobado.
- **Contexto:** Es un SaaS cerrado inicialmente. No se desean cuentas fantasma ni spam.
- **Decisión:** No existirán endpoints de registro público. La creación de la clínica raíz y el usuario propietario inicial se logra mediante el script interno `npm run bootstrap:owner`.

### ADR-010 Diseño clínico claro como interfaz inicial
- **Estado:** Aprobado y aplicado.
- **Contexto:** La interfaz inicial era oscura y técnica (tipo dev/cripto), causando fricción y desconexión con el gremio médico.
- **Decisión:** Adoptar una paleta estrictamente clara, limpia, con abundante espacio blanco, bordes tenues, colores azul clínico/turquesa e iconografía amigable.
- **Consecuencias:** Se eliminaron las reglas de _dark mode_ en el frontend para forzar una apariencia profesional y hospitalaria unificada.
