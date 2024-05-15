FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat git

COPY package.json .yarnrc.yml yarn.lock ./
RUN corepack enable
RUN yarn install

COPY . .
RUN yarn build:docker

##############################################

FROM node:20-alpine AS target

WORKDIR /app/build
COPY --from=builder /app/node_modules /app/build/node_modules
COPY --from=builder /app/build /app/build

EXPOSE 6969

VOLUME "/app/build/user"
ENTRYPOINT ["node", "/app/build/obj/ide/ReleaseEntry.js"]
