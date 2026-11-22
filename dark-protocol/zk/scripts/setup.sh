#!/usr/bin/env bash
# setup.sh — compile the withdraw circuit and run a LOCAL DEV-ONLY
# Groth16 trusted setup (Powers of Tau + phase 2).
#
# !!! The keys produced here are DEVELOPMENT KEYS. A single local contributor
# !!! knows/controls the toxic waste. Production requires a multi-party
# !!! MPC ceremony. See README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

CIRCOM=${CIRCOM:-../tools/circom}
SNARKJS="node ./node_modules/snarkjs/cli.js"
POWER=${POWER:-14}   # 2^14 = 16384 max constraints; circuit is ~12.9k
                     # (12,645 pre-NEW-1 + the Poseidon(cm, amount) leaf binding)

mkdir -p build keys

echo "== compile =="
$CIRCOM circuits/withdraw.circom --r1cs --wasm --sym -o build -l node_modules
node ./node_modules/snarkjs/cli.js r1cs info build/withdraw.r1cs | grep -E "Constraints|Public Inputs" || true

echo "== powers of tau (bn128, 2^$POWER) =="
if [ ! -f keys/pot_final.ptau ]; then
  $SNARKJS powersoftau new bn128 $POWER keys/pot_0000.ptau -v
  $SNARKJS powersoftau contribute keys/pot_0000.ptau keys/pot_0001.ptau \
    --name="dark-defi DEV contributor 1" -e="dark defi dev ceremony entropy $(date +%s) $RANDOM" -v
  $SNARKJS powersoftau prepare phase2 keys/pot_0001.ptau keys/pot_final.ptau -v
fi

echo "== phase 2 (groth16) =="
$SNARKJS groth16 setup build/withdraw.r1cs keys/pot_final.ptau keys/withdraw_0000.zkey
$SNARKJS zkey contribute keys/withdraw_0000.zkey keys/withdraw_dev.zkey \
  --name="dark-defi DEV contributor 1" -e="dark defi dev phase2 entropy $(date +%s) $RANDOM" -v
$SNARKJS zkey export verificationkey keys/withdraw_dev.zkey keys/verification_key.json

echo "== export solana-format vk =="
node scripts/export_vk.js

echo "== generate rust drop-in vk =="
node scripts/generate_vk_rs.js

echo "== verify the ceremony output =="
$SNARKJS zkey verify build/withdraw.r1cs keys/pot_final.ptau keys/withdraw_dev.zkey

echo "== stage final artifacts at the zk/ root (standardized names) =="
cp build/withdraw_js/withdraw.wasm withdraw.wasm
cp keys/withdraw_dev.zkey withdraw.zkey
cp keys/verification_key.json verification_key.json
cp keys/verification_key.json withdraw.vkey.json

echo "done. DEV KEYS in keys/ — NOT for production."
