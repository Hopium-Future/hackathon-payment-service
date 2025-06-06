###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:20-alpine AS development

# RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci --force; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i; \
  else yarn install; \
  fi

COPY --chown=node:node . .

USER node

###################
# PRODUCTION
###################

FROM node:20-alpine AS production

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules

COPY --chown=node:node . .

USER node

CMD [ "node", "server.js" ]
