#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${COMPANYPLAN_ENV_FILE:-$repo_root/.env.prod}"
shared_secret="${COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET:-}"

if [ -z "$shared_secret" ]; then
  echo "[deploy][ERROR] GitHub Actions secret COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET is empty" >&2
  exit 1
fi
if [ ! -f "$env_file" ]; then
  echo "[deploy][ERROR] missing production environment file" >&2
  exit 1
fi

backup_file="${env_file}.backup-$(date +%Y%m%d-%H%M%S)"
temp_file="$(mktemp "${env_file}.XXXXXX")"
cleanup() {
  if [ -f "$temp_file" ]; then
    unlink -- "$temp_file"
  fi
}
trap cleanup EXIT

cp -p -- "$env_file" "$backup_file"
awk '!/^COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET=/' "$env_file" > "$temp_file"
printf 'COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET=%s\n' "$shared_secret" >> "$temp_file"
chmod 600 "$temp_file"
mv -f -- "$temp_file" "$env_file"
trap - EXIT

echo "[deploy] playable feedback service credential updated"
