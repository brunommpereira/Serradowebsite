# Imagem única para os serviços (middleware e backend): o comando decide qual corre.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY shared ./shared
COPY db ./db
COPY backend/src ./backend/src
COPY middleware/src ./middleware/src
USER node
# Por omissão corre o middleware; o docker-compose define o comando de cada serviço
CMD ["node", "middleware/src/server.ts"]
