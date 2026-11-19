#!/usr/bin/env bash
# finalize.sh — close out a phase-2 MPC ceremony (see RUNBOOK.md):
#   1. apply the final random beacon to the last contributed zkey,
#   2. verify the final zkey (requires "ZKey Ok!"),
#   3. export the verification key and convert it to the groth16-solana
#      byte format (vk_solana.bin) via ceremony/export_vk.js,
#   4. byte-compare the new VK against the bytes currently spliced into
#      programs/dark-protocol/src/vk.rs and REPORT the result.
#
#   usage: ceremony/finalize.sh <last.zkey> <beacon-hash-hex> <iterations-exp> <out-dir> [r1cs] [ptau]
#
# The beacon hash must be the PRE-ANNOUNCED public randomness chosen before
# the ceremony started (a future drand round, a future block hash — see
# RUNBOOK.md). <iterations-exp> is the exponent: snarkjs applies the hash
# 2^exp times (10 is the conventional choice).
#
# This script NEVER splices anything into programs/dark-protocol/src/vk.rs and never
# writes into the tree's zk/ artifact slots. After a real ceremony the new
# VK MUST DIFFER from the current vk.rs (new contributions change the
# keys); MATCH would mean the ceremony produced the old key — a red flag,
# not a success. Splicing is a separate, deliberate, manual step gated on
# the full test suites (RUNBOOK.md, "VK handoff").
#
# Refuses to overwrite any existing output file.
set -euo pipefail

CEREMONY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZK_DIR="$(cd "$CEREMONY_DIR/.." && pwd)"
REPO_DIR="$(cd "$ZK_DIR/.." && pwd)"
SNARKJS=(node "$ZK_DIR/node_modules/snarkjs/cli.js")
STRIP_ANSI='s/\x1b\[[0-9;]*m//g'

if [ $# -lt 4 ] || [ $# -gt 6 ]; then
  echo "usage: $0 <last.zkey> <beacon-hash-hex> <iterations-exp> <out-dir> [r1cs] [ptau]" >&2
  exit 2
fi
LAST="$1"; BEACON_HASH="$2"; ITER_EXP="$3"; OUTDIR="$4"
R1CS="${5:-$ZK_DIR/build/withdraw.r1cs}"
PTAU="${6:-$ZK_DIR/keys/pot_hermez15.ptau}"
VK_RS="$REPO_DIR/programs/dark-protocol/src/vk.rs"

[ -f "$LAST" ] || { echo "ERROR: last zkey not found: $LAST" >&2; exit 1; }
[ -f "$R1CS" ] || { echo "ERROR: r1cs not found: $R1CS" >&2; exit 1; }
[ -f "$PTAU" ] || { echo "ERROR: ptau not found: $PTAU" >&2; exit 1; }
[ -f "$VK_RS" ] || { echo "ERROR: vk.rs not found: $VK_RS" >&2; exit 1; }
[[ "$BEACON_HASH" =~ ^[0-9a-fA-F]+$ ]] || { echo "ERROR: beacon hash must be hex, got: $BEACON_HASH" >&2; exit 1; }
[[ "$ITER_EXP" =~ ^[0-9]+$ ]] || { echo "ERROR: iterations-exp must be a non-negative integer, got: $ITER_EXP" >&2; exit 1; }

mkdir -p "$OUTDIR"
FINAL_ZKEY="$OUTDIR/withdraw_final.zkey"
FINAL_VK_JSON="$OUTDIR/verification_key.json"
for f in "$FINAL_ZKEY" "$FINAL_VK_JSON" "$OUTDIR/vk_solana.bin" "$OUTDIR/vk_solana.json"; do
  if [ -e "$f" ]; then
    echo "ERROR: refusing to overwrite existing file: $f" >&2
    exit 1
  fi
done

echo "== step 1/4: apply the random beacon =="
echo "input zkey:    $LAST"
echo "beacon hash:   $BEACON_HASH"
echo "iterations:    2^$ITER_EXP"
"${SNARKJS[@]}" zkey beacon "$LAST" "$FINAL_ZKEY" "$BEACON_HASH" "$ITER_EXP" -v 2>&1 | \
  sed "$STRIP_ANSI" | grep -E "Contribution Hash|snarkJS: " | tail -8 || true
[ -f "$FINAL_ZKEY" ] || { echo "ERROR: beacon step did not produce $FINAL_ZKEY" >&2; exit 1; }
echo "final zkey:    $FINAL_ZKEY"
echo "final sha256:  $(sha256sum "$FINAL_ZKEY" | awk '{print $1}')"

echo
echo "== step 2/4: verify the final zkey =="
VERIFY_LOG="$(mktemp)"
trap 'rm -f "$VERIFY_LOG"' EXIT
if ! "${SNARKJS[@]}" zkey verify "$R1CS" "$PTAU" "$FINAL_ZKEY" > "$VERIFY_LOG" 2>&1; then
  sed "$STRIP_ANSI" "$VERIFY_LOG" | tail -20 >&2
  echo "ERROR: final zkey FAILED verification. Do not use it. See RUNBOOK.md." >&2
  exit 1
fi
sed -i "$STRIP_ANSI" "$VERIFY_LOG"
grep -q "ZKey Ok!" "$VERIFY_LOG" || { echo "ERROR: 'ZKey Ok!' missing from verify output." >&2; exit 1; }
echo "ZKey Ok! — final zkey verifies against the r1cs and ptau."

echo
echo "== step 3/4: export verification key -> vk_solana.bin =="
"${SNARKJS[@]}" zkey export verificationkey "$FINAL_ZKEY" "$FINAL_VK_JSON"
node "$CEREMONY_DIR/export_vk.js" "$FINAL_VK_JSON" "$OUTDIR"
echo "new vk_solana.bin sha256: $(sha256sum "$OUTDIR/vk_solana.bin" | awk '{print $1}')"

echo
echo "== step 4/4: byte-compare against programs/dark-protocol/src/vk.rs (report only) =="
# Extract the byte constants currently spliced into vk.rs (alpha||beta||
# gamma||delta||ic, in order) into a temp blob and compare. vk.rs arrays
# are pure number blocks in that exact layout (see its header).
VK_RS_BLOB="$(mktemp)"
trap 'rm -f "$VERIFY_LOG" "$VK_RS_BLOB"' EXIT
python3 - "$VK_RS" "$VK_RS_BLOB" <<'PYEOF'
import re, sys
src = open(sys.argv[1]).read()
order = [("VK_ALPHA_G1", 64), ("VK_BETA_G2", 128), ("VK_GAMMA_G2", 128),
         ("VK_DELTA_G2", 128), ("VK_IC", 320)]
blob = bytearray()
for name, want in order:
    i = src.index("pub const " + name)
    j = src.index("= [", i)
    k = src.index("];", j)
    nums = [int(x) for x in re.findall(r"\d+", src[j:k])]
    assert len(nums) == want, "%s: got %d numbers, want %d" % (name, len(nums), want)
    blob += bytes(nums)
assert len(blob) == 768, "vk.rs blob is %d bytes, want 768" % len(blob)
open(sys.argv[2], "wb").write(bytes(blob))
PYEOF

if cmp -s "$OUTDIR/vk_solana.bin" "$VK_RS_BLOB"; then
  echo "RESULT: MATCH — the ceremony VK is byte-identical to programs/dark-protocol/src/vk.rs."
  echo "After a REAL ceremony this must not happen (new contributions change"
  echo "the keys). MATCH is expected only when finalizing the tree's current"
  echo "dev key. Treat a MATCH after a real ceremony as a red flag."
else
  echo "RESULT: DIFFERS — the ceremony VK differs from programs/dark-protocol/src/vk.rs."
  echo "This is REQUIRED after a real ceremony: the new key replaces the old"
  echo "only through the manual, test-gated splice in RUNBOOK.md."
fi
if cmp -s "$OUTDIR/vk_solana.bin" "$ZK_DIR/vk_solana.bin"; then
  echo "(cross-check vs zk/vk_solana.bin: MATCH)"
else
  echo "(cross-check vs zk/vk_solana.bin: DIFFERS)"
fi

echo
echo "======================================================================"
echo "FINALIZE COMPLETE — nothing was spliced or written into the tree."
echo "Outputs in $OUTDIR:"
echo "  withdraw_final.zkey    (proving key, post-beacon)"
echo "  verification_key.json  (snarkjs VK export)"
echo "  vk_solana.bin/.json    (groth16-solana byte format)"
echo
echo "Next steps are MANUAL and test-gated — see RUNBOOK.md, 'VK handoff':"
echo "  1. run ceremony/verify-transcript.sh over the full chain incl. this"
echo "     final zkey; publish the transcript."
echo "  2. feed verification_key.json through zk/scripts/export_vk.js +"
echo "     zk/scripts/generate_vk_rs.js in a working copy of the tree."
echo "  3. splice the generated constants into programs/dark-protocol/src/vk.rs,"
echo "     stage withdraw_final.zkey as zk/withdraw.zkey (+ wasm/vkey staging)."
echo "  4. acceptance gate: zk e2e 13/13, program 20/20, client-lib 34/34 —"
echo "     all green before the new keys are called production."
echo "======================================================================"
