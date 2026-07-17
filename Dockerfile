FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Se recibe desde el pipeline (docker build --build-arg APP_VERSION=vX.Y.Z)
# y queda expuesta en GET /health. Permite, durante la demo en vivo,
# distinguir con un simple curl si la respuesta vino del pod estable
# o del pod canary.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000

CMD ["node", "src/index.js"]
