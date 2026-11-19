#!/usr/bin/env bash
# verify-transcript.sh — independently verify a phase-2 contribution chain.
#
#   usage: ceremony/verify-transcript.sh <chain-dir> [circuit.r1cs] [ptau]
#
# <chain-dir> holds the chained zkeys in sequence, named so that a plain
# lexical sort gives the ceremony order, e.g.:
#   withdraw_0000.zkey  (groth16 setup output, 0 contributions)
#   withdraw_0001.zkey  (after contributor 1)
#   withdraw_0002.zkey  (after contributor 2)
#   withdraw_final.zkey (after the beacon; sorts last)
#
# For EVERY zkey in the chain this runs `snarkjs zkey verify` against the
# circuit r1cs and the phase-1 ptau and requires "ZKey Ok!". It then checks
# the hash chain itself: each hop's contribution list must extend the
# previous hop's list by EXACTLY ONE contribution, with all earlier
# contributions byte-identical (number, name, hash). Finally it prints the
# full transcript — every contribution hash in ceremony order — taken from
# the last zkey, for comparison against the published transcript.
#
# Defaults: r1cs = ../build/withdraw.r1cs, ptau = ../keys/pot_hermez15.ptau
# (the APPROVED production phase 1: Hermez powersOfTau28_hez_final_15.ptau —
# see RUNBOOK.md. For a REHEARSAL on the tree's local dev ptau, pass
# ../keys/pot_final.ptau explicitly as the third argument.)
set -euo pipefail

CEREMONY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZK_DIR="$(cd "$CEREMONY_DIR/.." && pwd)"
SNARKJS=(node "$ZK_DIR/node_modules/snarkjs/cli.js")
STRIP_ANSI='s/\x1b\[[0-9;]*m//g'

if [ $# -lt 1 ] || [ $# -gt 3 ]; then
  echo "usage: $0 <chain-dir> [circuit.r1cs] [ptau]" >&2
  exit 2
fi
DIR="$1"
R1CS="${2:-$ZK_DIR/build/withdraw.r1cs}"
PTAU="${3:-$ZK_DIR/keys/pot_hermez15.ptau}"

[ -d "$DIR" ] || { echo "ERROR: chain dir not found: $DIR" >&2; exit 1; }
[ -f "$R1CS" ] || { echo "ERROR: r1cs not found: $R1CS" >&2; exit 1; }
[ -f "$PTAU" ] || { echo "ERROR: ptau not found: $PTAU" >&2; exit 1; }

shopt -s nullglob
ZKEYS=( "$DIR"/*.zkey )
shopt -u nullglob
[ "${#ZKEYS[@]}" -ge 1 ] || { echo "ERROR: no .zkey files in $DIR" >&2; exit 1; }
# lexical sort = ceremony order (zero-padded numbering; *_final sorts last)
IFS=$'\n' ZKEYS=( $(printf '%s\n' "${ZKEYS[@]}" | sort) ); unset IFS

# Parse `zkey verify` output (already ANSI-stripped) into normalized
# contribution records: "num<TAB>name<TAB>hash128", ascending by num.
parse_contribs() {
  awk '
    /contribution #[0-9]+ / {
      s = $0; sub(/^.*contribution #/, "", s)
      num = s; sub(/ .*/, "", num)
      name = s; sub(/^[0-9]+ /, "", name); sub(/:$/, "", name)
      cur = num; names[num] = name; hashes[num] = ""
      if (num + 0 > max) max = num + 0
      next
    }
    cur != "" {
      h = $0; gsub(/[ \t]/, "", h)
      if (h ~ /^[0-9a-f]+$/ && length(h) == 32) {
        hashes[cur] = hashes[cur] h
        if (length(hashes[cur]) >= 128) cur = ""
      }
    }
    END { for (i = 1; i <= max; i++) if (i in hashes) print i "\t" names[i] "\t" hashes[i] }
  ' "$1"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== verifying transcript in $DIR =="
echo "r1cs: $R1CS"
echo "ptau: $PTAU"
echo

PREV=""
PREV_COUNT=0
LAST_RECORDS=""
for Z in "${ZKEYS[@]}"; do
  RAW="$WORK/$(basename "$Z").verify.log"
  echo "-- hop: $Z"
  if ! "${SNARKJS[@]}" zkey verify "$R1CS" "$PTAU" "$Z" > "$RAW" 2>&1; then
    sed "$STRIP_ANSI" "$RAW" | tail -20 >&2
    echo "ERROR: snarkjs zkey verify FAILED for $Z" >&2
    echo "TRANSCRIPT INVALID — see RUNBOOK.md (what invalidates a ceremony)." >&2
    exit 1
  fi
  sed -i "$STRIP_ANSI" "$RAW"
  if ! grep -q "ZKey Ok!" "$RAW"; then
    echo "ERROR: 'ZKey Ok!' not found in verify output for $Z" >&2
    exit 1
  fi
  RECORDS="$WORK/$(basename "$Z").contribs"
  parse_contribs "$RAW" > "$RECORDS"
  COUNT="$(grep -c . "$RECORDS" || true)"
  echo "   ZKey Ok!  (contributions in this zkey: $COUNT)"

  if [ -n "$PREV" ]; then
    # every earlier contribution must be present, identical, in the same slot
    if ! awk -F '\t' 'NR==FNR { a[$1]=$2"\t"$3; next } ($1 in a) && a[$1] != ($2"\t"$3) { bad=1 } END { exit bad }' "$PREV" "$RECORDS"; then
      echo "ERROR: contribution history changed between hops:" >&2
      echo "  previous: $PREV" >&2
      echo "  current:  $Z" >&2
      echo "TRANSCRIPT INVALID — a hop rewrote an earlier contribution." >&2
      exit 1
    fi
    if [ "$COUNT" -ne $((PREV_COUNT + 1)) ]; then
      echo "ERROR: hop added $((COUNT - PREV_COUNT)) contributions, expected exactly 1." >&2
      echo "TRANSCRIPT INVALID — contributions must be sequential, one per hop." >&2
      exit 1
    fi
  fi
  PREV="$RECORDS"; PREV_COUNT="$COUNT"; LAST_RECORDS="$RECORDS"
done

echo
echo "======================================================================"
echo "TRANSCRIPT — contribution hashes in ceremony order"
echo "(from ${ZKEYS[-1]}, after verifying every hop)"
echo "======================================================================"
awk -F '\t' '{ printf "  #%s  %s\n      %s\n", $1, $2, $3 }' "$LAST_RECORDS"
echo "======================================================================"
echo "RESULT: TRANSCRIPT OK — ${#ZKEYS[@]} zkeys, $PREV_COUNT contributions,"
echo "every hop verified (ZKey Ok!), hash chain intact, +1 contribution/hop."
echo "Compare the hashes above against the published transcript before"
echo "trusting this chain. Any mismatch invalidates the ceremony."
