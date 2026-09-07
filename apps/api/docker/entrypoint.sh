#!/bin/sh
# Ledger Key Ring secret custody (ETHOnline 2026 Ledger track — see
# context/backend-roadmap.md §4.2 and docs/ledger-key-ring-setup.md).
#
# If AGENT_SECRETS_ENC points at a Key Ring ciphertext file, decrypt it and
# export the secrets it contains (RILEY_SESSION_KEY, ONEINCH_API_KEY) into
# this process's env before starting the app. If it isn't set, or the file
# isn't there, fall straight through — RILEY_SESSION_KEY/ONEINCH_API_KEY are
# then expected to already be in the environment, exactly as today.
#
# WALLET_PASS must come from a secret store (Coolify env, keychain, etc) —
# never a literal value in this script or in a command someone types.
set -eu

SECRETS_FILE="${AGENT_SECRETS_ENC:-}"
KEY_RING_KEY="${AGENT_SECRETS_KEY_RING_KEY:-handler-prod}"

if [ -n "$SECRETS_FILE" ] && [ -f "$SECRETS_FILE" ]; then
  if [ -z "${WALLET_PASS:-}" ]; then
    echo "entrypoint: $SECRETS_FILE is set but WALLET_PASS is empty" >&2
    exit 1
  fi

  echo "entrypoint: decrypting agent secrets from $SECRETS_FILE (key: $KEY_RING_KEY)"

  # Decrypt straight to stdout, parse as JSON, print `export K=V` lines — the
  # plaintext values only ever live in this process's memory/env, never on
  # disk and never in a shell history.
  DECRYPT_EXPORTS=$(
    wallet-cli ring decrypt --key "$KEY_RING_KEY" -i "$SECRETS_FILE" |
      node -e '
        let data = "";
        process.stdin.on("data", (chunk) => { data += chunk; });
        process.stdin.on("end", () => {
          const secrets = JSON.parse(data);
          for (const [key, value] of Object.entries(secrets)) {
            process.stdout.write(`export ${key}=${JSON.stringify(String(value))}\n`);
          }
        });
      '
  )
  eval "$DECRYPT_EXPORTS"
fi

exec sh -c "node_modules/.bin/prisma migrate deploy && node dist/main.js"
