# Runbook de Despliegue (Producción)

Este documento contiene los pasos seguros para desplegar **Yes Farma** en el entorno productivo (Droplet en DigitalOcean) sin afectar operaciones simultáneas (ej. "Chispita") y protegiendo la base de datos médica.

> [!CAUTION]
> **NUNCA** ejecutes `prisma migrate dev` ni `prisma migrate reset` en el entorno de producción. Podrías destruir datos clínicos irrecuperables.

---

## 1. Prechecks Locales (Opcional pero Recomendado)
Asegúrate de que la rama `main` esté estable en tu computadora:
```bash
# [LOCAL]
git switch main
git pull
git status
npm run test --prefix backend
```

## 2. Prechecks del Servidor
Conéctate por SSH al VPS. Revisa la memoria y el almacenamiento antes de iniciar contenedores pesados.
```bash
# [SERVIDOR]
free -m
df -h
```
> [!WARNING]
> Si la RAM disponible (`available`) es menor a 250MB o hay mucha `swap` usada intermitentemente, evalúa construir servicios (`docker compose build`) uno por uno, o escalar el Droplet temporalmente.

## 3. Revisión de Variables
Ingresa al proyecto en el servidor y asegúrate de que `.env` en el backend cuente con los secretos necesarios.
```bash
# [SERVIDOR]
cd /root/proyectos/yes-farma
cat backend/.env
```
Verifica (solo la existencia de nombres, **no pongas valores reales aquí**):
- `NODE_ENV`
- `PORT`
- `DATABASE_URL` (URL real apuntando a `yes-farma-db`)
- `APP_ORIGIN`
- `TRUST_PROXY`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

## 4. Respaldo de PostgreSQL (DB)
Antes de cualquier migración de estructura, saca un respaldo en frío del estado actual.
```bash
# [SERVIDOR]
docker exec -t yes-farma-db pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -F c -f /tmp/backup_yesfarma_predeploy.dump
docker cp yes-farma-db:/tmp/backup_yesfarma_predeploy.dump ./backup_yesfarma_predeploy.dump
```

## 5. Actualización Git
Carga los cambios al servidor asegurando no perder ramas.
```bash
# [SERVIDOR]
cd /root/proyectos/yes-farma
git fetch origin main
git merge --ff-only origin/main
```

## 6. Build
Lanza la compilación productiva usando Docker Compose apuntando al YAML de producción.
```bash
# [SERVIDOR]
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
> [!TIP]
> Dado que la base de datos (PostgreSQL) solo pertenece a `app-network` y el backend/frontend a `proxy-network` y `app-network`, el despliegue no debe fallar la conectividad, pero **verifícalo** con `docker ps`.

## 7. Aplicación de Migraciones
Este paso modifica la estructura de la base de datos productiva. Usa estrictamente `deploy`.
```bash
# [SERVIDOR]
docker exec -it yes-farma-backend npx prisma migrate deploy
```

## 8. Bootstrap del Propietario
Para configurar el acceso administrativo inicial (el Dr. propietario de la Clínica principal).
```bash
# [SERVIDOR]
printf "Correo del propietario: "
IFS= read -r OWNER_EMAIL

printf "Contraseña del propietario: "
IFS= read -rs OWNER_PASSWORD
printf "\n"

printf "Nombre: "
IFS= read -r OWNER_FIRST_NAME

printf "Apellidos: "
IFS= read -r OWNER_LAST_NAME

printf "Nombre de la clínica: "
IFS= read -r CLINIC_NAME

docker exec -it \
  -e BOOTSTRAP_OWNER_EMAIL="$OWNER_EMAIL" \
  -e BOOTSTRAP_OWNER_PASSWORD="$OWNER_PASSWORD" \
  -e BOOTSTRAP_OWNER_FIRST_NAME="$OWNER_FIRST_NAME" \
  -e BOOTSTRAP_OWNER_LAST_NAME="$OWNER_LAST_NAME" \
  -e BOOTSTRAP_CLINIC_NAME="$CLINIC_NAME" \
  -e BOOTSTRAP_SPECIALTY_CODE="DENTISTRY" \
  yes-farma-backend npm run bootstrap:owner

unset OWNER_EMAIL OWNER_PASSWORD OWNER_FIRST_NAME OWNER_LAST_NAME CLINIC_NAME
```

## 9. Pruebas de Humo
1. Ingresa vía web a `https://yes-farma.duckdns.org`.
2. Prueba que la interfaz cargue.
3. Prueba loguearte usando las credenciales del *Bootstrap*.
4. Prueba desde otra pestaña `curl -i https://yes-farma.duckdns.org/api/health`.

## 10. Revisión de Recursos
Una vez levantado todo:
```bash
# [SERVIDOR]
docker stats
```
Verifica que los servicios no consuman recursos exagerados ni bloqueen a "Chispita".

---

## Procedimiento de Emergencia y Rollback

### Rollback de Código / Contenedores
Si la nueva versión de la aplicación rompe (pero la BD sigue estable):
```bash
# [SERVIDOR]
git switch -c recovery_branch origin/main~1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Restauración de Base de Datos (Destructivo)
> [!CAUTION]
> Revertir migraciones de Prisma aplicadas (`deploy`) no es automático con `git revert`. Si la BD está irremediablemente dañada, se requiere restaurar desde el `dump`. Se perderán todos los datos transaccionados posteriores al backup.

```bash
# [SERVIDOR]
# Limpiar DB actual (cuidado)
docker exec -i yes-farma-db dropdb -U $POSTGRES_USER $POSTGRES_DB
docker exec -i yes-farma-db createdb -U $POSTGRES_USER $POSTGRES_DB

# Cargar volcado limpio al contenedor e importar
docker cp ./backup_yesfarma_predeploy.dump yes-farma-db:/tmp/
docker exec -t yes-farma-db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB -1 /tmp/backup_yesfarma_predeploy.dump
```
