# ALTAR / 任意容器平台通用镜像：零 npm 依赖，Node 22 原生跑 TS
FROM node:22-alpine
WORKDIR /app
COPY server.ts ./
COPY src ./src
COPY public ./public
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.ts"]
