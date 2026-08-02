# Historial Técnico (Changelog)

Este documento registra cronológicamente los hitos arquitectónicos y de sistema implementados en Yes Farma. No lista *features* funcionales menores, sino transformaciones base (arquitectura, infraestructura, modelos complejos).

---

### Agosto 2026

- **Documentación de Continuidad Operativa (Actual)**
  *Commit: 78d3ce0 (previo a rama docs)*
  - Creación de estándares de continuidad en AI (`AI_HANDOFF.md`, runbooks, contextos) permitiendo independencia de entornos y desarrolladores.

- **Diseño Clínico Limpio (Frontend UI)**
  *Commit: 78d3ce0*
  - Reemplazo absoluto del modo oscuro heredado por una paleta "Slate/Clínica" forzada mediante Tailwind para mejorar el _engagement_ del usuario médico.

- **Infraestructura Multi-tenant de Identidad (Migración Inicial)**
  *Commit: adca7d8*
  - Aplicación de migración Prisma para esquemas `User`, `Clinic`, `Membership`, `Session`, `ProfessionalProfile`, y `AuditEvent`.
  - Habilitación completa del backend Express con middleware para autenticar mediante **Cookies HttpOnly** y **Scrypt**, evadiendo JWT en favor de seguridad opaca.
  - Generación interna del Script `bootstrap-owner` para sembrar los datos productivos del consultorio (SaaS cerrado).

- **Optimización de Cliente de Base de Datos y Dependencias**
  *Integrado en hitos paralelos*
  - Actualización a Prisma 7 y PostgreSQL 15 nativo usando el Driver Adapter `pg`, solucionando vulnerabilidades clásicas de conexión de servidor Serverless e incompatibilidades.

- **Separación de Infraestructura Docker y Proxy-Network**
  *Commit: 03ebb98*
  - Desacoplamiento del esquema `docker-compose.yml` base en dos mutaciones operativas: `dev` y `prod`. 
  - Adición exitosa a `proxy-network` para interactuar con Nginx Proxy Manager en el VPS de Digital Ocean.
  - Bloqueo total del puerto 5432 del contenedor `yes-farma-db` al exterior.

- **Infraestructura Base y Healthchecks**
  *Commit: 515b080*
  - Configuración rígida del healthcheck (`pg_isready`) de la base de datos PostgreSQL, garantizando arranque limpio del backend Express que depende de ella.

- **Fundación del Proyecto Monorepo (Yes Farma)**
  *Commit Inicial: 7398be0*
  - Inicialización estructural de Vite (Frontend) y Node 22 (Backend).

*(Nota: Historial reconstruido a través del rastro en las referencias de Git `main`)*
