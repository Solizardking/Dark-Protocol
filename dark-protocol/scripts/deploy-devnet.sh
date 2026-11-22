#!/bin/bash
# Dark Protocol — DEVNET deployment (TRANSPLANT-SPEC W5 rehearsal procedure).
#
# This is the procedure actually run for the W5 devnet rehearsal
# (2026-11-17; see ../../W5-REHEARSAL.md at the repo root). It deploys the
# merged dark-protocol program to Solana DEVNET ONLY and initializes the
# pool. It is deliberately NOT a general deploy tool:
#
#   * Hard devnet guard: the RPC URL must contain "devnet" or the script
#     refuses to run. There is no mainnet path in this file, on purpose —
#     mainnet is gated on the real MPC ceremony plus a separate decision.
#   * Keypairs are referenced BY PATH under ~/workspace/deploy-keys/
#     (generated fresh at W5, stored outside this tree, never committed).
#     No secret material is embedded in or printed by this script.
#   * The buffer uses its own keypair so a stalled/interrupted upload is
#     resumable: re-running write-buffer with the same buffer keypair
#     continues instead of stranding a funded anonymous buffer.
#   * The SBF artifact must already be built (cargo-build-sbf route, see
#     W5-REHEARSAL.md); this script does not build.
#
# Env overrides:
#   RPC_URL     devnet RPC (default: Helius devnet if HELIUS_DEVNET is set
#               in ~/workspace/vault/helius-relay.env, else public devnet)
#   KEYS_DIR    keypair directory (default ~/workspace/deploy-keys)
set -euo pipefail

KEYS_DIR="${KEYS_DIR:-$HOME/workspace/deploy-keys}"
PROGRAM_KP="$KEYS_DIR/dark-protocol-program.json"
DEPLOYER_KP="$KEYS_DIR/w5-deployer.json"
BUFFER_KP="$KEYS_DIR/w5-buffer.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SO="$SCRIPT_DIR/../target/deploy/dark_protocol.so"

for f in "$PROGRAM_KP" "$DEPLOYER_KP" "$BUFFER_KP" "$SO"; do
  if [ ! -f "$f" ]; then echo "missing required file: $f" >&2; exit 1; fi
done

# RPC selection + DEVNET GUARD.
if [ -z "${RPC_URL:-}" ]; then
  if [ -f "$HOME/workspace/vault/helius-relay.env" ]; then
    # shellcheck disable=SC1091
    set -a; . "$HOME/workspace/vault/helius-relay.env" 2>/dev/null || true; set +a
    RPC_URL="${HELIUS_DEVNET:-https://api.devnet.solana.com}"
  else
    RPC_URL="https://api.devnet.solana.com"
  fi
fi
case "$RPC_URL" in
  *devnet*) ;;
  *) echo "REFUSING: RPC_URL does not target devnet: $RPC_URL" >&2; exit 1 ;;
esac
# Redacted display (the Helius URL embeds an API key).
RPC_DISPLAY="$(printf '%s' "$RPC_URL" | sed -E 's/(api-key=)[^&]+/\1<redacted>/')"
echo "RPC: $RPC_DISPLAY"

export PATH="$HOME/.local/share/solana/bin:$PATH"
PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KP")"
DEPLOYER="$(solana-keygen pubkey "$DEPLOYER_KP")"
BUFFER="$(solana-keygen pubkey "$BUFFER_KP")"
echo "Program ID: $PROGRAM_ID"
echo "Deployer / upgrade authority (rehearsal custody): $DEPLOYER"
echo "Buffer: $BUFFER"

echo "Cluster health:"
curl -s -X POST "$RPC_URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
echo ""

echo "Deployer balance (need >= ~2.25 SOL for the deploy buffer):"
solana balance "$DEPLOYER" --url "$RPC_URL"

echo "Writing buffer (resumable)..."
solana program write-buffer "$SO" \
  --buffer "$BUFFER_KP" --keypair "$DEPLOYER_KP" --url "$RPC_URL"

echo "Deploying from buffer..."
if ! solana program deploy --buffer "$BUFFER" \
    --program-id "$PROGRAM_KP" --keypair "$DEPLOYER_KP" --url "$RPC_URL"; then
  echo "Buffer-only deploy form failed; retrying with the .so path..."
  solana program deploy "$SO" --buffer "$BUFFER" \
    --program-id "$PROGRAM_KP" --keypair "$DEPLOYER_KP" --url "$RPC_URL"
fi

echo "Verifying the deployed program..."
solana program show "$PROGRAM_ID" --url "$RPC_URL"

cat <<EOF

Deployed to DEVNET:
  Program:  $PROGRAM_ID
  Deployer: $DEPLOYER (upgrade authority — rehearsal custody only;
            mainnet authority custody is a separate future decision)

Next (rehearsal): initialize the pool and run the deposit/withdraw
rehearsal via the drivers in ~/workspace/w5-rehearsal/ (w5.mjs). The
initialize instruction takes no arguments; the Pool PDA seeds are
["pool"] and the Vault PDA seeds are ["vault"] under this program ID.
EOF
