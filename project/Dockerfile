FROM node:16-buster AS builder

WORKDIR /app

COPY package.json .
RUN yarn

COPY tsconfig.json tsconfig.base.json ./
COPY src ./src
RUN yarn test:comp-linux

##############################################

FROM debian:buster

COPY --from=builder /app/bundle /bin/Aki-server

EXPOSE 6969

CMD ["/bin/Aki-server"]
