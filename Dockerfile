FROM ghcr.io/blakeb415/plex-ffmpeg:n6.1.2 AS base

ENV NVM_VERSION=v0.33.11
ENV NODE_VERSION=20.18.1
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

COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
RUN corepack use pnpm@latest

EXPOSE 32402

ENTRYPOINT ["pnpm", "start"]