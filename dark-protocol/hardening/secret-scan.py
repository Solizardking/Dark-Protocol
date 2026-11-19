#!/usr/bin/env python3
"""secret-scan.py — guard against committing Solana secret key material.

Scans a directory tree and FAILS (exit 1) if it finds:

  1. A file whose whole content is a JSON array of exactly 64 integers
     (0-255)  -> a Solana secret keypair file (solana-keygen format).
  2. A file whose whole content is a JSON array of exactly 32 integers
     (0-255)  -> a raw Ed25519 seed (Keypair.fromSeed material).
  3. Any text file containing an embedded bracketed array of exactly 64
     byte values (keypair pasted into source, config, or a JSON object).
  4. A PEM private-key header (BEGIN ... PRIVATE KEY).

Embedded 32-byte arrays are reported as REVIEW warnings only: a 32-byte
array in source is as often a public key as a seed, so a human decides.
Base58-encoded secret keys and mnemonic phrases are NOT detected (they
are indistinguishable from public data without more context) — this
guard complements, and does not replace, key hygiene.

Output names the file and, for keypairs, the PUBLIC key derived from the
stored public half (bytes 32..64). Secret bytes are never printed.

Usage: secret-scan.py <dir> [<dir> ...] [--no-skip]
Exit:  0 = clean, 1 = secret material found, 2 = usage error.
Default skips: .git, node_modules, target (build/dependency output).
"""

import json
import os
import re
import sys

B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
DEFAULT_SKIP = {".git", "node_modules", "target"}
MAX_FILE_BYTES = 20 * 1024 * 1024

# A bracketed run of at least 32 comma-separated byte values, possibly
# spanning lines (pretty-printed JSON / pasted source arrays).
ARRAY_RE = re.compile(r"\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]", re.DOTALL)
NUM_RE = re.compile(r"\d{1,3}")
PEM_RE = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")


def b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = B58_ALPHABET[r] + out
    pad = 0
    for b in raw:
        if b == 0:
            pad += 1
        else:
            break
    return "1" * pad + (out or "")


def byte_values(text: str):
    return [int(x) for x in NUM_RE.findall(text)]


def is_byte_array(vals) -> bool:
    return all(0 <= v <= 255 for v in vals)


def scan_file(path):
    """Return (failures, warnings): lists of human-readable hit strings."""
    failures, warnings = [], []
    try:
        if os.path.getsize(path) > MAX_FILE_BYTES:
            return failures, warnings
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return failures, warnings
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return failures, warnings  # binary: not a text key format we detect

    # Rule 4: PEM private keys.
    if PEM_RE.search(text):
        failures.append("PEM private key header")

    # Rules 1-2: whole file is a bare JSON byte array.
    stripped = text.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        try:
            data = json.loads(stripped)
        except ValueError:
            data = None
        if (
            isinstance(data, list)
            and data
            and all(isinstance(v, int) and not isinstance(v, bool) for v in data)
            and is_byte_array(data)
        ):
            if len(data) == 64:
                pub = b58encode(bytes(data[32:64]))
                failures.append(f"Solana secret keypair file (public key: {pub})")
                return failures, warnings
            if len(data) == 32:
                failures.append("raw 32-byte seed file (public key not derivable here)")
                return failures, warnings

    # Rule 3 + warnings: embedded arrays anywhere in the text.
    seen_lens = set()
    for match in ARRAY_RE.finditer(text):
        vals = byte_values(match.group(0))
        if not is_byte_array(vals):
            continue
        if len(vals) == 64 and 64 not in seen_lens:
            seen_lens.add(64)
            pub = b58encode(bytes(vals[32:64]))
            failures.append(f"embedded 64-byte secret keypair array (public key: {pub})")
        elif len(vals) == 32 and 32 not in seen_lens:
            seen_lens.add(32)
            warnings.append("embedded 32-byte array (seed or public key — review)")
    return failures, warnings


def scan_tree(root, skip):
    failures, warnings = [], []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            f, w = scan_file(path)
            failures += [(path, h) for h in f]
            warnings += [(path, h) for h in w]
    return failures, warnings


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    skip = set() if "--no-skip" in argv else set(DEFAULT_SKIP)
    if not args:
        print(__doc__)
        return 2
    total_failures = 0
    for root in args:
        if not os.path.isdir(root):
            print(f"error: not a directory: {root}", file=sys.stderr)
            return 2
        failures, warnings = scan_tree(root, skip)
        for path, hit in failures:
            print(f"FAIL {path}: {hit}")
        for path, hit in warnings:
            print(f"REVIEW {path}: {hit}")
        total_failures += len(failures)
        print(
            f"scanned {root}: {len(failures)} failure(s), {len(warnings)} review warning(s)"
        )
    if total_failures:
        print("SECRET MATERIAL FOUND — do not commit this tree.")
        return 1
    print("clean: no secret key material detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
