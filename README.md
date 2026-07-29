# yes-farma

Aplicación integral para la gestión de farmacias, expedientes médicos y agendamiento.

## Estructura
El repositorio está dividido en:
- `frontend/`: PWA creada con React + Vite.
- `backend/`: API REST creada en Node.js + Express + Prisma ORM.

## Requisitos
- [Docker](https://docs.docker.com/get-docker/) y Docker Compose.

## Cómo ejecutar en desarrollo

La manera más rápida de levantar toda la arquitectura (Base de Datos + Frontend + Backend) es usando Docker.

1. Asegúrate de estar en la raíz del proyecto.
2. Ejecuta el siguiente comando para levantar los servicios:
   ```bash
   docker compose up -d
   ```
3. Verifica que los servicios estén corriendo:
   ```bash
   docker compose ps
   ```

### Accesos
- **Frontend**: http://localhost:3000
- **Backend (API)**: http://localhost:3001
- **Base de Datos (PostgreSQL)**: expuesta en `localhost:5433`

## Base de Datos (Prisma)
Para aplicar migraciones y sincronizar la base de datos:
```bash
cd backend
npx prisma migrate dev --name init
```
