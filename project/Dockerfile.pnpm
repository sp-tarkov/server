FROM node:lts-bullseye as builder

WORKDIR /app
ARG PNPM_VERSION=7.25.1
ENV PNPM_VERSION=$PNPM_VERSION

RUN curl -fsSL https://get.pnpm.io/install.sh | SHELL=`which bash` bash -
ENV PATH="$PATH:/root/.local/share/pnpm/"

ENTRYPOINT [ "pnpm" ]