FROM node:20-bookworm

WORKDIR /workspace

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development

COPY package.json yarn.lock* ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN corepack enable && corepack prepare yarn@1.22.22 --activate \
    && yarn install --frozen-lockfile --ignore-engines || yarn install --ignore-engines

COPY . .

EXPOSE 8081 4040 5432 5050

CMD ["bash", "-lc", "cd /workspace && tail -f /dev/null"]
