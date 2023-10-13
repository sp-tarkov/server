FROM node:14 as builder

WORKDIR /app

COPY package.json .
RUN npm i

COPY . .
RUN npm run gen:docs

FROM nginx:latest

COPY --from=builder /app/docs /usr/share/nginx/html