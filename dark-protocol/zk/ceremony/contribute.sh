#!/usr/bin/env bash
# contribute.sh — make ONE phase-2 contribution to the withdraw circuit's
# proving key, as part of the multi-party MPC ceremony (see RUNBOOK.md).
#
#   usage: ceremony/contribute.sh <input.zkey> <output.zkey> <contributor-name>
#
# The contributor's secret entropy is prompted for on the terminal with echo
# disabled and is NEVER written to any file or log by this script. (It is
# passed to snarkjs as a process argument — one more reason to contribute
# from your own, ideally fresh/air-gapped, machine: see RUNBOOK.md.)
#
# For REHEARSAL/TEST runs only, entropy may be supplied via the
# CEREMONY_ENTROPY environment variable; the script prints a loud warning
# in that case. NEVER use CEREMONY_ENTROPY for a real ceremony.
#
# Refuses to overwrite an existing output file: a ceremony chain is
# append-only, and clobbering a hop destroys the transcript.
set -euo pipefail

CEREMONY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZK_DIR="$(cd "$CEREMONY_DIR/.." && pwd)"
SNARKJS=(node "$ZK_DIR/node_modules/snarkjs/cli.js")
STRIP_ANSI='s/\x1b\[[0-9;]*m//g'

if [ $# -ne 3 ]; then
  echo "usage: $0 <input.zkey> <output.zkey> <contributor-name>" >&2
  exit 2
fi
IN="$1"; OUT="$2"; NAME="$3"

[ -f "$IN" ] || { echo "ERROR: input zkey not found: $IN" >&2; exit 1; }
[ -n "$NAME" ] || { echo "ERROR: contributor name must not be empty" >&2; exit 1; }
if [ -e "$OUT" ]; then
  echo "ERROR: refusing to overwrite existing file: $OUT" >&2
  echo "A ceremony chain is append-only. Pick the next zkey name in sequence." >&2
  exit 1
fi

# ---------------------------------------------------------------- entropy ---
ENTROPY=""
ENTROPY2=""
cleanup() { ENTROPY=""; ENTROPY2=""; unset ENTROPY ENTROPY2 CEREMONY_ENTROPY || true; }
trap cleanup EXIT

if [ -n "${CEREMONY_ENTROPY:-}" ]; then
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!! WARNING: entropy taken from the CEREMONY_ENTROPY env variable. !!"
  echo "!! This is for REHEARSAL / TEST runs ONLY — env vars leak via shell !!"
  echo "!! history, /proc and crash dumps. NEVER do this for a real        !!"
  echo "!! ceremony contribution.                                           !!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  ENTROPY="$CEREMONY_ENTROPY"
else
  if [ ! -r /dev/tty ]; then
    echo "ERROR: no terminal available to prompt for entropy." >&2
    echo "Run this script interactively on your own machine (see RUNBOOK.md)." >&2
    echo "(Rehearsal runs may set CEREMONY_ENTROPY instead — test only.)" >&2
    exit 1
  fi
  echo "You are about to contribute secret entropy to the Dark Protocol MPC ceremony."
  echo "Use a LONG, unguessable secret that exists nowhere else: diceware words,"
  echo "hardware-random output, keyboard mashing — at least ~30 characters."
  echo "It will be hashed into the proving key and must then be DESTROYED:"
  echo "never saved, never reused, never typed anywhere else ever again."
  read -r -s -p "Entropy (input hidden): " ENTROPY < /dev/tty; echo
  read -r -s -p "Repeat the same entropy: " ENTROPY2 < /dev/tty; echo
  if [ "$ENTROPY" != "$ENTROPY2" ]; then
    echo "ERROR: the two entries do not match. Nothing was written. Start over." >&2
    exit 1
  fi
  if [ -z "$ENTROPY" ]; then
    echo "ERROR: entropy must not be empty." >&2
    exit 1
  fi
  if [ "${#ENTROPY}" -lt 30 ]; then
    echo "WARNING: that entropy is short (${#ENTROPY} chars). The ceremony's" >&2
    echo "security rests on each contribution being unguessable. Strongly" >&2
    echo "consider aborting (Ctrl-C) and using a longer secret." >&2
  fi
fi

# ------------------------------------------------------------- contribute ---
echo "== phase-2 contribution =="
echo "input:  $IN"
echo "output: $OUT"
echo "name:   $NAME"

TMPLOG="$(mktemp)"
trap 'rm -f "$TMPLOG"; cleanup' EXIT

# snarkjs output (hashes only — never the entropy) is shown live and kept in
# a temp log just long enough to extract the contribution hash below.
"${SNARKJS[@]}" zkey contribute "$IN" "$OUT" --name="$NAME" -e="$ENTROPY" -v 2>&1 | tee "$TMPLOG"

[ -f "$OUT" ] || { echo "ERROR: snarkjs did not produce $OUT" >&2; exit 1; }

HASH="$(sed "$STRIP_ANSI" "$TMPLOG" | awk '
  /Contribution Hash:/ { flag=1; next }
  flag {
    h = $0; gsub(/[ \t]/, "", h)
    if (h ~ /^[0-9a-f]+$/ && length(h) == 32) {
      printf "%s", h; n++
      if (n == 4) exit
    }
  }')"

echo
echo "======================================================================"
echo "CONTRIBUTION RECORDED"
echo "  contributor:       $NAME"
echo "  output zkey:       $OUT"
if [ -n "$HASH" ]; then
  echo "  contribution hash: $HASH"
else
  echo "  contribution hash: (could not parse from snarkjs output — recover it"
  echo "                      by running ceremony/verify-transcript.sh)"
fi
echo "  zkey sha256:       $(sha256sum "$OUT" | awk '{print $1}')"
echo
echo "Publish the contribution hash, your name and the zkey sha256 in the"
echo "ceremony transcript, and pass $OUT to the next contributor."
echo
echo "NOW DESTROY YOUR ENTROPY: clear your terminal scrollback, and make"
echo "sure it exists nowhere — no notes, no files, no password manager,"
echo "no shell history. Its destruction is what makes this ceremony sound."
echo "======================================================================"
