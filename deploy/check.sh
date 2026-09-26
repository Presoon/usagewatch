#!/usr/bin/env bash
# Exercise deployment/rollback in a temporary directory. No Docker or server access.
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d)"
export TEST_TARGET="$test_dir/site"
sed "s|^DEPLOY_DIR=.*|DEPLOY_DIR='$TEST_TARGET'|" "$source_dir/deploy.sh" > "$test_dir/deploy.sh"
cp "$source_dir/compose.yml" "$test_dir/compose.yml"
export GHCR_TOKEN=test GHCR_USER=test
good="ghcr.io/test/site@sha256:$(printf 'a%.0s' {1..64})"
bad="ghcr.io/test/site@sha256:$(printf 'b%.0s' {1..64})"
export BAD_IMAGE="$bad"

id() { printf 'ghactions\n'; }
install() { mkdir -p "$TEST_TARGET"; }
docker() {
  if [[ "$1" == login ]]; then cat >/dev/null; fi
  if [[ " $* " == *' up '* ]]; then
    # An exported WEB_IMAGE would override the restored Compose env file.
    if [[ -n "${WEB_IMAGE:-}" ]] || grep -Fq "$BAD_IMAGE" "$TEST_TARGET/.env.deploy"; then
      return 1
    fi
  fi
  return 0
}
curl() { printf '<body data-site="usagewatch"></body>\n'; }
export -f id install docker curl

WEB_IMAGE="$good" bash "$test_dir/deploy.sh" >/dev/null
grep -Fxq "WEB_IMAGE=$good" "$TEST_TARGET/.env.deploy"
if WEB_IMAGE="$bad" bash "$test_dir/deploy.sh" >/dev/null; then
  echo 'Failed update incorrectly returned success.' >&2
  exit 1
fi
grep -Fxq "WEB_IMAGE=$good" "$TEST_TARGET/.env.deploy"
cmp "$source_dir/compose.yml" "$TEST_TARGET/compose.yml"
if WEB_IMAGE='not-a-digest' bash "$test_dir/deploy.sh" >/dev/null 2>&1; then
  echo 'Invalid image was accepted.' >&2
  exit 1
fi
grep -Fxq "WEB_IMAGE=$good" "$TEST_TARGET/.env.deploy"
rm "$TEST_TARGET/.env.deploy" "$TEST_TARGET/compose.yml"
if WEB_IMAGE="$bad" bash "$test_dir/deploy.sh" >/dev/null; then
  echo 'Failed first installation incorrectly returned success.' >&2
  exit 1
fi
test ! -e "$TEST_TARGET/.env.deploy"
test ! -e "$TEST_TARGET/compose.yml"
rm "$test_dir/deploy.sh" "$test_dir/compose.yml"
rmdir "$TEST_TARGET" "$test_dir"
echo 'Deployment checks passed: install, failed-update rollback, invalid digest, failed-first-install cleanup.'
