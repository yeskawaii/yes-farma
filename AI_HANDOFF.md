# Handoff para Asistentes de IA (AI_HANDOFF)

**Lee este archivo completo antes de modificar el proyecto.**

Este documento permite continuar el desarrollo del proyecto Yes Farma de forma segura desde cualquier chat nuevo, herramienta de IA o entorno, preservando el contexto y la continuidad operativa.

## Propósito
Yes Farma es una plataforma clínica SaaS en evolución, inicialmente diseñada para un consultorio odontológico. El repositorio actual contiene la base fundacional de autenticación, diseño de interfaz y arquitectura Docker.

## Estado Resumido
El proyecto tiene un frontend React (Vite) con diseño clínico claro, un backend Node.js (Express, TypeScript) con sesiones opacas persistidas en PostgreSQL (Prisma 7), y una infraestructura Dockerizada para desarrollo y producción separadas. **Aún no** se implementan módulos operativos como pacientes o agenda. La autenticación está terminada.

## Arquitectura
- **Frontend:** React, TypeScript, Vite, Tailwind CSS (diseño clínico, no oscuro), React Router, PWA.
- **Backend:** Node.js 22, Express 5, TypeScript, Prisma 7 (con `@prisma/adapter-pg`), PostgreSQL 15, Zod.
- **Autenticación:** Sesiones opacas almacenadas en la base de datos (cookie `HttpOnly`). Contraseñas con `scrypt` asíncrono y hash en constante tiempo (no JWT, no bcrypt).
- **Modelo Tenant:** `Clinic` -> `Membership` (contiene rol) -> `User`.
- **Despliegue:** DigitalOcean (Ubuntu), Docker Compose, Nginx Proxy Manager.

## Ramas y Commit Estable
- **Rama Estable:** `main`
- **Último Commit Estable (Verificado):** `78d3ce0 feat(ui): refresh clinical interface`
- **Rama Actual (Documentación):** `docs/project-continuity`

## Entornos y Comandos de Inicio (Lectura)
- **Local (Desarrollo):** 
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- **Productivo (Servidor):**
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- El proxy inverso productivo corre bajo la red externa `proxy-network`.

## Reglas de Seguridad
- Nunca subir secretos, hashes, correos personales, URLs de DB reales ni IPs.
- El servidor soporta el proyecto, pero está muy ajustado de RAM (aprox. 313 MB disponibles).
- La BD no expone su puerto al host.
- Nunca afectar otros contenedores del servidor (ej. `chispita_backend`, `central-proxy-nginx`).
- **NUNCA** hacer un `prisma migrate dev` o `prisma migrate reset` en producción. Usa `prisma migrate deploy`.

## Validaciones
- Backend: `npm run typecheck`, `npm run test`, `npm run build`
- Frontend: `npm run build`
- Prisma: `npx prisma validate`, `npx prisma migrate status`

## Siguiente Paso Exacto
El código de autenticación y rediseño clínico ya fue mezclado en `main`. El **siguiente paso exacto** es realizar un despliegue productivo seguro en DigitalOcean siguiendo los pasos del runbook, y posteriormente iniciar el desarrollo del módulo de Pacientes y Agenda.

## Enlaces a Documentación
- Contexto de Negocio: [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)
- Decisiones de Arquitectura: [ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md)
- Estado Actual Fotográfico: [CURRENT_STATUS.md](docs/CURRENT_STATUS.md)
- Runbook de Despliegue: [DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md)
- Historial Técnico: [CHANGELOG_TECHNICAL.md](docs/CHANGELOG_TECHNICAL.md)

---

### Prompt para continuar en un chat nuevo

*Copia y pega el siguiente bloque en un chat nuevo para recuperar el contexto inmediatamente:*

```text
Estamos continuando el proyecto Yes Farma.
Lee primero AI_HANDOFF.md y todos los archivos de /docs.
No modifiques nada todavía.
Resume el estado actual, identifica riesgos y dime únicamente el siguiente paso seguro.
```
