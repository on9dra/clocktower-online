FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV PORT=3000
EXPOSE 3000
# 房間存檔在 /app/data，掛個卷就能在重建容器後保留
VOLUME /app/data
CMD ["node", "server.js"]
