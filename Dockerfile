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

USER node
CMD ["npm", "start"]
