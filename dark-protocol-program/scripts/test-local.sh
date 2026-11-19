#!/usr/bin/env bash
# Run the program tests against a throwaway local validator. Never touches devnet/mainnet.
# The program is loaded at its declared id (E8zL7h…) via --bpf-program, so the
# build keypair in target/deploy does not need to match.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROGRAM_ID="E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"
SO="target/deploy/dark_protocol_program.so"
[ -f "$SO" ] || anchor build
[ -f target/types/dark_protocol_program.ts ] || anchor build

TMP="$(mktemp -d)"
trap 'kill ${VALIDATOR_PID:-0} 2>/dev/null || true; rm -rf "$TMP"' EXIT
solana-keygen new --no-bip39-passphrase --silent --force -o "$TMP/wallet.json" >/dev/null
WALLET_PUBKEY="$(solana-keygen pubkey "$TMP/wallet.json")"

RPC_PORT="${RPC_PORT:-8899}"
solana-test-validator --reset --quiet --ledger "$TMP/ledger" --rpc-port "$RPC_PORT" \
  --bpf-program "$PROGRAM_ID" "$SO" --mint "$WALLET_PUBKEY" >"$TMP/validator.log" 2>&1 &
VALIDATOR_PID=$!

for _ in $(seq 1 60); do
  solana -u "http://127.0.0.1:$RPC_PORT" cluster-version >/dev/null 2>&1 && break
  sleep 1
done

ANCHOR_PROVIDER_URL="http://127.0.0.1:$RPC_PORT" ANCHOR_WALLET="$TMP/wallet.json" \
  npx ts-mocha -p ./tsconfig.json -t 120000 "tests/**/*.ts"
