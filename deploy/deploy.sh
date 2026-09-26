#!/usr/bin/env bash
set -euo pipefail

# Deploys the pinned GHCR image with Docker Compose; rolls back on failure.
DEPLOY_DIR=/home/ghactions/usagewatch
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(id -un)" != ghactions ]]; then
  echo 'The deployment runner must run as ghactions.' >&2
  exit 1
fi
if [[ ! "${WEB_IMAGE:-}" =~ ^ghcr\.io/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo 'WEB_IMAGE must be a GHCR image pinned to a SHA-256 digest.' >&2
  exit 1
fi
docker compose version
printf '%s' "${GHCR_TOKEN:?GHCR_TOKEN is required}" | docker login ghcr.io --username "${GHCR_USER:?GHCR_USER is required}" --password-stdin
docker pull "$WEB_IMAGE"
image_ref="$WEB_IMAGE"
# The process environment overrides Compose's env file, including during rollback.
unset WEB_IMAGE
install -d -m 700 "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
backup="$(mktemp -d "$DEPLOY_DIR/.previous.XXXXXX")"
had_previous=false
activated=false
compose() { docker compose --project-name usagewatch --env-file .env.deploy -f compose.yml "$@"; }

if [[ -f .env.deploy && -f compose.yml ]]; then
  cp .env.deploy compose.yml "$backup/"
  had_previous=true
elif [[ -f .env.deploy || -f compose.yml ]]; then
  rmdir "$backup"
  echo 'Incomplete existing deployment; repair it before deploying.' >&2
  exit 1
fi

finish() {
  result=$?
  trap - EXIT
  if (( result != 0 )) && [[ "$activated" == true ]]; then
    compose logs --tail 30 || true
    if [[ "$had_previous" == true ]]; then
      cp "$backup/.env.deploy" .env.deploy
      cp "$backup/compose.yml" compose.yml
      if ! compose up -d --wait --wait-timeout 90; then
        echo 'Rollback failed; inspect the usagewatch Compose project.' >&2
      fi
    else
      compose down || true
      rm -f .env.deploy compose.yml
    fi
  fi
  rm -f "$backup/.env.deploy" "$backup/compose.yml" .env.deploy.next
  rmdir "$backup"
  exit "$result"
}
trap finish EXIT
umask 077
printf 'WEB_IMAGE=%s\n' "$image_ref" > .env.deploy.next
activated=true
cp "$SOURCE_DIR/compose.yml" compose.yml
mv .env.deploy.next .env.deploy
compose up -d --wait --wait-timeout 90
curl --fail --silent --show-error http://127.0.0.1:6723/ | grep 'data-site="usagewatch"' >/dev/null
echo 'UsageWatch website is healthy on port 6723.'
