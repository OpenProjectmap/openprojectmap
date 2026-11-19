# The self-host image (spec 06 §4): serves a hub of project maps and keeps it fresh from git.
# Built from this source tree, so the image always matches the commit it was built from.
#   docker build -t openprojectmap .
#   docker run -p 4173:4173 -v ./opmap.hub.json:/config/opmap.hub.json:ro -v opmap-data:/data openprojectmap

FROM node:22-alpine AS build
WORKDIR /src
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && mkdir /out && npm pack --pack-destination /out

FROM node:22-alpine
# git clones the repos in the hub file, openssh-client reaches them over ssh, tini reaps processes.
RUN apk add --no-cache git openssh-client tini
COPY --from=build /out/openprojectmap-*.tgz /tmp/openprojectmap.tgz
RUN npm install --global --omit=dev /tmp/openprojectmap.tgz \
 && rm /tmp/openprojectmap.tgz \
 && mkdir -p /data/repos /config \
 && chown -R node:node /data
USER node
WORKDIR /data
ENV NODE_ENV=production OPMAP_REPOS_DIR=/data/repos
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--", "opmap"]
CMD ["serve", "--hub", "/config/opmap.hub.json", "--host", "0.0.0.0", "--pull-interval", "300"]
