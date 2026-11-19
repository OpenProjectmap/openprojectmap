#!/usr/bin/env bash
# Builds the image, runs it on the Tidepool example and checks what a self-hoster would see.
#   scripts/docker-smoke.sh            (needs a running Docker daemon)
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${IMAGE:-openprojectmap:smoke}"
NAME="opmap-smoke-$$"
WORK="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

docker build -t "$IMAGE" .

cp -r examples/tidepool "$WORK/tidepool"
cat > "$WORK/opmap.hub.json" <<'JSON'
{ "title": "Smoke test", "projects": [{ "name": "Tidepool", "path": "/projects/tidepool" }] }
JSON
chmod -R a+rX "$WORK"

docker run -d --name "$NAME" -p 127.0.0.1:4173:4173 \
  -v "$WORK/opmap.hub.json:/config/opmap.hub.json:ro" \
  -v "$WORK/tidepool:/projects/tidepool:ro" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:4173/healthz | grep -qx ok

echo "check: the index lists the project"
curl -fsS http://127.0.0.1:4173/ | grep -q '<h1>Smoke test</h1>'
curl -fsS http://127.0.0.1:4173/ | grep -q 'href="tidepool/index.html"'

echo "check: the project map is served with a CSP header and a way back"
HEADERS="$(curl -fsSI http://127.0.0.1:4173/tidepool/)"
echo "$HEADERS" | grep -qi '^content-security-policy:'
curl -fsS http://127.0.0.1:4173/tidepool/ | grep -q 'opmap-hub'

echo "check: it runs as a normal user, not root"
test "$(docker exec "$NAME" id -u)" != 0

echo "check: the version and the hub command exist"
docker exec "$NAME" opmap --version
docker exec "$NAME" opmap hub /config/opmap.hub.json --out /tmp/site --no-fetch -q >/dev/null

echo "smoke test passed"
