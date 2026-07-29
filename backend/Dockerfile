FROM node:18-alpine

WORKDIR /usr/src/app

# Copiar configuración de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY . .

# Generar cliente de Prisma
RUN npx prisma generate

# Exponer puerto
EXPOSE 3000

# Comando para desarrollo. 
# En producción sería: CMD ["npm", "run", "start"]
CMD ["npx", "nodemon", "src/index.ts"]
