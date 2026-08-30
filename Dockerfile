FROM node:alpine

RUN apk --no-cache add ca-certificates

RUN mkdir -p /source
WORKDIR /source
COPY . .

RUN npm install -g pnpm@11.4.0
RUN pnpm install --frozen-lockfile
RUN pnpm run build

CMD ["pnpm", "run", "start"]