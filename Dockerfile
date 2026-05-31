FROM ghcr.io/flexmediaserver/plex-ffmpeg:latest AS base

WORKDIR /usr/src/app

ENV NVM_VERSION=v0.33.11
ENV NODE_VERSION=24.2.0
ENV PNPM_HOME="/pnpm"
ENV NVM_DIR=/usr/local/nvm
RUN mkdir $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash

ENV NODE_PATH=$NVM_DIR/v${NODE_VERSION}/lib/node_modules
ENV PATH=$NVM_DIR/versions/node/v${NODE_VERSION}/bin:$PATH

RUN echo "source $NVM_DIR/nvm.sh && \
	nvm install $NODE_VERSION && \
	nvm alias default $NODE_VERSION && \
	nvm use default" | bash

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package*.json ./
COPY pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --force --dangerously-allow-all-builds

COPY . .

RUN pnpm run build

EXPOSE 32402

ENTRYPOINT pnpm run start:prod