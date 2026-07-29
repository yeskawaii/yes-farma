# Etapa 1: Construcción (Build)
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Etapa 2: Servir con Nginx
FROM nginx:alpine

# Copiar el build del frontend a la carpeta de nginx
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copiar configuración custom si es necesaria, por ahora la default sirve
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
