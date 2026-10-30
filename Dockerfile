# The app as a standalone Next server for the VM (selfhost/docker-compose.apps.yml). Built for arm64
# by .github/workflows/deploy.yml and pushed to ghcr.io/thehimmat/gurmukhi-kosh.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Inlined at build time. The anon key is public (it ships to browsers); the server reads
# SUPABASE_URL and SUPABASE_ANON_KEY at runtime first (lib/supabase.ts).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
# Owned by node: ISR writes regenerated pages under .next/server.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
