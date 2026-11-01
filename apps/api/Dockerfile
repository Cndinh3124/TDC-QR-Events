# Image backend - dac ta 8.5: pin phien ban, chay user khong phai root
# Build tu thu muc goc repo:  docker build -f apps/api/Dockerfile -t tdc-qr-api .
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci
COPY apps/api apps/api
RUN npm run -w apps/api build

FROM node:22.23.4-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# chi cai thu vien chay that, khong co cong cu dev
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/assets apps/api/assets
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
