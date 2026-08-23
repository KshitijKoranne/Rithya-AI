FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./
COPY audio.mjs ./
COPY server.mjs smoke.mjs README.md ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

USER node
CMD ["npm", "start"]
