FROM node:20-bookworm-slim

# Prisma uchun openssl, HTTPS uchun sertifikatlar
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV TZ=Asia/Tashkent

# Avval faqat package fayllari (kesh uchun)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY prisma prisma
RUN npm ci --include=optional --no-audit --no-fund || npm install --include=optional --no-audit --no-fund

# Kod va build
COPY . .
RUN npm run build \
  && npm prune --omit=dev --no-audit --no-fund \
  && npx prisma generate

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Migratsiyalar, keyin server
CMD ["npm", "start"]
