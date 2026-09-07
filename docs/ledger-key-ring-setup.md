# Ledger Key Ring setup — Riley's secrets

How to move `RILEY_SESSION_KEY` and `ONEINCH_API_KEY` from plaintext Coolify
env to Ledger Key Ring ciphertext, per `context/backend-roadmap.md` §4.2. The
mechanism (decrypt-at-boot entrypoint) is already landed
(`apps/api/docker/entrypoint.sh`, `apps/api/Dockerfile`); everything below is
the manual, device-required part.

This needs a physical Ledger device and cannot be scripted end-to-end by an
agent — do these steps yourself.

## 1. Install the CLI

```bash
npm i -g @ledgerhq/wallet-cli@2.1.0
```

## 2. Store the Key Ring member password in your OS keychain

Never type the password into a command literally — see Ledger's own
guidance: a literal value leaks into shell history, `ps` output, and CI logs.

macOS:

```bash
security add-generic-password -a default -s ledger-wallet-cli -w
```

Linux (`libsecret`):

```bash
secret-tool store --label="Ledger wallet-cli" service ledger-wallet-cli account default
```

## 3. Enroll this machine as a Key Ring member (device required)

```bash
WALLET_PASS=$(security find-generic-password -a default -s ledger-wallet-cli -w) \
  wallet-cli ring init --name <your-name>
```

Confirm on the device when prompted. This creates or joins the trustchain
this machine will use to encrypt/decrypt.

## 4. Encrypt Riley's secrets

Pick real values for `RILEY_SESSION_KEY` (Riley's session-key private key)
and `ONEINCH_API_KEY`, then:

```bash
printf '{"RILEY_SESSION_KEY":"0x...","ONEINCH_API_KEY":"..."}' | \
  WALLET_PASS=$(security find-generic-password -a default -s ledger-wallet-cli -w) \
  wallet-cli ring encrypt --key handler-prod -o secrets/handler-prod.enc
```

`secrets/handler-prod.enc` is ciphertext — safe to commit, but keep it out of
this repo until it's real (a placeholder file would silently break the
entrypoint's decrypt step in prod). `--key handler-prod` scopes it; use the
same scope key for `ring decrypt`.

## 5. Wire it into Coolify

- Set `WALLET_PASS` in Coolify's env for the `api` service, sourced from
  whatever secret store Coolify itself supports — not typed in directly if
  avoidable.
- Set `AGENT_SECRETS_ENC=/run/secrets/handler-prod.enc`.
- Mount `secrets/handler-prod.enc` into the `api` container at that path
  (Coolify "file mount" / a bind volume in `docker-compose.prod.yml`).
- **Once verified working, remove the plaintext `RILEY_SESSION_KEY` /
  `ONEINCH_API_KEY` lines from `docker-compose.prod.yml`.** The entrypoint
  falls back to those if `AGENT_SECRETS_ENC` isn't set, so leaving both in
  place during the transition is safe — just don't leave both in place
  permanently, since that defeats the point.

## 6. Open question: enrolling the VPS itself (day-6 spike)

Step 3 above (`ring init`) needs the physical device present, which a
headless Coolify VPS doesn't have. This is exactly Ledger's own "bring the
Key Ring to hosts with no USB port" priority area for the track, and it
isn't resolved here — options to investigate (their Telegram support group
is linked from the track page):

- Does `ring init` support enrolling a member without the device physically
  attached to *that* machine (e.g. approving from a paired mobile/desktop
  Ledger Live session)?
- Or: enroll only ever happens on a machine with the device, and what needs
  to reach the VPS is that machine's member credentials (config file under
  `~/.wallet-cli` or similar) — if so, document exactly what that file is
  and how it's provisioned to Coolify, and whether that's an accepted use of
  the tool.

Don't guess at an answer without checking Ledger's docs/support — if this
turns out to be genuinely unsupported, the decrypt step can run from an
already-enrolled machine and the ciphertext can just be pre-decrypted... but
that reintroduces a plaintext secret at rest, so it should be a last resort,
not the default plan.

## 7. Record DX feedback

Ledger's track is judged partly on developer-experience feedback. Log what
was smooth vs. confusing while doing steps 1–6 in `docs/ledger-feedback.md`.
